import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { getCart } from "@/features/cart/repository";
import { estimateFromCatalog } from "@/features/leads/estimate";
import { LeadError } from "@/features/leads/errors";
import { InMemoryLeadListContextReader } from "@/features/leads/memory-context-reader";
import { NoopLeadNotifier } from "@/features/leads/notifier";
import type { NewLeadRecord } from "@/features/leads/ports";
import {
  createLead,
  createLeadStore,
  expireDue,
  getForRequester,
  getForStationery,
  getRequesterDetail,
  getStationeryPublic,
  listCandidateStationeries,
  listForRequester,
  listForStationery,
  markViewed,
  recordWhatsappOpen,
  transitionLead,
} from "@/features/leads/repository";
import { LeadService } from "@/features/leads/service";
import { canTransition, LEAD_ACTORS, LEAD_STATUSES, type LeadActor, type LeadStatus } from "@/features/leads/state";
import { getSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { IDS, cleanupUsers, purgeLeads, purgeStationeries, seedCart, seedLead, seedStationery, seedUsers, withSuperuser } from "../db/helpers";

// Roda em `pnpm test:db` (Supabase local da trilha). Chaves lidas de `scripts/supa.mjs env` em tempo de execução.
function localEnv(): { url: string; publishable: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("só roda contra Supabase local");
  return { url, publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), secret: get("SUPABASE_SECRET_KEY") };
}

const RUN = `${Date.now() % 1_000_000}`;
const PASSWORD = "senha-de-teste-local-123";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let env: ReturnType<typeof localEnv>;
let admin: SupabaseClient;
let municipalityId: string;
const userIds: string[] = [];
const stationeryIds: string[] = [];
const cartIds: string[] = [];
const roles = new Map<string, string>();
const emails = new Map<string, string>();

type TestRole = "parent" | "admin" | "stationery_member";

async function makeUser(label: string, role: TestRole = "parent"): Promise<string> {
  const email = `lead-${label}-${RUN}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  userIds.push(id);
  roles.set(id, role);
  emails.set(id, email);
  await withSuperuser((c) =>
    c.query(
      `insert into public.profiles (id, role, display_name) values ($1, $2, $3)
       on conflict (id) do update set role = excluded.role`,
      [id, role, `Teste ${label}`],
    ),
  );
  return id;
}

/** Único jeito de obter um ator: passa por getSessionActor (sessão simulada), como nas Server Actions. */
async function actor(userId: string): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = roles.get(userId) ?? "parent";
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

/** Cliente com a SESSÃO do usuário (RLS e grants por coluna valem). */
async function sessionClient(userId: string): Promise<SupabaseClient> {
  const c = createClient(env.url, env.publishable, opts);
  const { error } = await c.auth.signInWithPassword({ email: emails.get(userId) ?? "", password: PASSWORD });
  if (error) throw new Error(`login: ${error.message}`);
  return c;
}

async function newStationery(ownerId: string, over: { status?: "active" | "paused"; neighborhood?: string } = {}): Promise<string> {
  const id = await withSuperuser((c) =>
    seedStationery(c, { status: over.status ?? "active", ownerId, overrides: { municipality_id: municipalityId, neighborhood: over.neighborhood ?? "Centro" } }),
  );
  stationeryIds.push(id);
  return id;
}

async function newCart(ownerId: string, isDemo = true): Promise<string> {
  const id = await withSuperuser(async (c) => {
    const cart = await seedCart(c, ownerId, isDemo);
    await c.query("insert into public.cart_items (cart_id, name, quantity) values ($1, 'Caderno 96 folhas', 2), ($1, 'Lápis HB', 12)", [cart]);
    return cart;
  });
  cartIds.push(id);
  return id;
}

const record = (cartId: string, stationeryId: string, over: Partial<NewLeadRecord> = {}): NewLeadRecord => ({
  cartId,
  listId: randomUUID(),
  stationeryId,
  schoolName: "Escola Demonstração",
  gradeLabel: "5º ano",
  schoolYear: 2027,
  municipalityId,
  neighborhood: null,
  items: [
    { name: "Caderno 96 folhas", itemKey: "caderno 96 folhas", quantity: 2 },
    { name: "Lápis HB", itemKey: "lapis hb", quantity: 12 },
  ],
  consentTextVersion: "lead-test-v1",
  idempotencyKey: randomUUID(),
  isDemo: true,
  ...over,
});

async function errorCode(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(LeadError);
  return (err as LeadError).code;
}

beforeAll(async () => {
  env = localEnv();
  admin = createClient(env.url, env.secret, opts);
  await seedUsers();
  municipalityId = await withSuperuser(async (c) => (await c.query("select id from public.municipalities order by ibge_code limit 1")).rows[0].id as string);
});

afterAll(async () => {
  await purgeLeads({ requesterIds: [...userIds, IDS.parent], cartIds });
  await purgeStationeries(stationeryIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await cleanupUsers();
});

describe("matriz TS x banco (lead_transition)", () => {
  it("canTransition coincide com a função SQL nas 324 combinações ator x de x para", async () => {
    const ACTOR_ID: Record<LeadActor, string | null> = { stationery: IDS.stationery_member, parent: IDS.parent, admin: IDS.admin, system: null };
    const mismatches: string[] = [];
    await withSuperuser(async (c) => {
      for (const actorRole of LEAD_ACTORS) {
        for (const from of LEAD_STATUSES) {
          for (const to of LEAD_STATUSES) {
            await c.query("begin");
            try {
              const stationeryId = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
              const { id } = await seedLead(c, { stationeryId, requesterId: IDS.parent, status: from, expiresIn: actorRole === "system" ? "-1 day" : "+7 days" });
              const reason = to === "declined" ? "price" : actorRole === "admin" && to === "cancelled" ? "abuso comprovado" : null;
              let failed = false;
              let returned: string | null = null;
              await c.query("savepoint s");
              try {
                returned = (
                  await c.query("select public.lead_transition($1::uuid, $2::public.lead_status, $3::uuid, $4::text, null, $5::text)::text as s", [id, to, ACTOR_ID[actorRole], actorRole, reason])
                ).rows[0].s as string;
              } catch {
                failed = true;
                await c.query("rollback to savepoint s");
              }
              const after = (await c.query("select status::text as s from public.leads where id = $1", [id])).rows[0].s as string;
              const dbAllows = !failed && after === to && after !== from && returned === to;
              if (dbAllows !== canTransition(actorRole, from as LeadStatus, to as LeadStatus)) mismatches.push(`${actorRole}: ${from} -> ${to} (banco ${dbAllows ? "permite" : "recusa"})`);
            } finally {
              await c.query("rollback");
            }
          }
        }
      }
    });
    expect(mismatches).toEqual([]);
  }, 120_000);
});

describe("ciclo do lead pelo repositório", () => {
  let parentId: string;
  let otherParentId: string;
  let ownerA: string;
  let ownerB: string;
  let adminId: string;
  let stationeryA: string;
  let stationeryB: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let code: string;
  let cart: string;

  beforeAll(async () => {
    parentId = await makeUser("parent");
    otherParentId = await makeUser("parent2");
    ownerA = await makeUser("ownerA", "stationery_member");
    ownerB = await makeUser("ownerB", "stationery_member");
    adminId = await makeUser("admin", "admin");
    stationeryA = await newStationery(ownerA);
    stationeryB = await newStationery(ownerB);
    clientA = await sessionClient(ownerA);
    clientB = await sessionClient(ownerB);
    cart = await newCart(parentId);
  });

  it("recusa ator forjado (objeto comum, não vindo de getSessionActor)", async () => {
    const forged = { userId: parentId, role: "parent" } as unknown as SessionActor;
    expect(await errorCode(createLead(admin, forged, record(cart, stationeryA)))).toBe("forbidden");
    expect(await errorCode(listForRequester(admin, forged))).toBe("forbidden");
    expect(await errorCode(transitionLead(admin, forged, { code: "LC-5TJ1", to: "cancelled", as: "parent" }))).toBe("forbidden");
  });

  it("só parent cria lead; idempotente pela chave; código no formato", async () => {
    expect(await errorCode(createLead(admin, await actor(ownerA), record(cart, stationeryB)))).toBe("forbidden");
    const rec = record(cart, stationeryA);
    const first = await createLead(admin, await actor(parentId), rec);
    expect(first.created).toBe(true);
    expect(first.code).toMatch(/^LC-[0-9A-HJKMNP-TV-Z]{4,6}$/);
    const again = await createLead(admin, await actor(parentId), rec);
    expect(again).toEqual({ ...first, created: false });
    code = first.code;
  });

  it("carrinho alheio e consentimento vazio: erros mapeados", async () => {
    const otherCart = await newCart(otherParentId);
    expect(await errorCode(createLead(admin, await actor(parentId), record(otherCart, stationeryA)))).toBe("forbidden");
    expect(await errorCode(createLead(admin, await actor(parentId), record(cart, stationeryA, { consentTextVersion: " " })))).toBe("consent_required");
    expect(await errorCode(createLead(admin, await actor(parentId), record(cart, stationeryA, { isDemo: false })))).toBe("invalid_input");
  });

  it("a papelaria lê o lead sem nenhum dado do responsável", async () => {
    const { rows, truncated } = await listForStationery(clientA, await actor(ownerA), stationeryA);
    expect(truncated).toBe(false);
    const row = rows.find((r) => r.code === code);
    expect(row).toMatchObject({ status: "received", schoolName: "Escola Demonstração", gradeLabel: "5º ano", schoolYear: 2027, itemCount: 2, isDemo: true });
    const json = JSON.stringify(rows);
    for (const secret of [parentId, cart, emails.get(parentId) ?? "", "requester", "cartId", "idempotency", "consent"]) expect(json).not.toContain(secret);

    const detail = await getForStationery(clientA, await actor(ownerA), stationeryA, code);
    expect(detail?.items.map((i) => [i.name, i.quantity])).toEqual([["Caderno 96 folhas", 2], ["Lápis HB", 12]]);
    expect(detail?.events.map((e) => e.eventType)).toEqual(["created"]);
    const dj = JSON.stringify(detail);
    for (const secret of [parentId, cart, "requester", "reason", "actorId", "actor_id"]) expect(dj).not.toContain(secret);
  });

  it("o banco nega à sessão da papelaria as colunas que identificam o responsável", async () => {
    for (const cols of ["*", "requester_id", "cart_id", "consent_id", "idempotency_key"]) {
      const r = await clientA.from("leads").select(cols).limit(1);
      expect(r.error, `select ${cols}`).not.toBeNull();
    }
    expect((await clientA.from("lead_events").select("reason").limit(1)).error).not.toBeNull();
    expect((await clientA.from("lead_events").select("actor_id").limit(1)).error).not.toBeNull();
  });

  it("outra papelaria não vê o lead (lista, detalhe por código e com o id da alheia)", async () => {
    expect((await listForStationery(clientB, await actor(ownerB), stationeryB)).rows).toEqual([]);
    expect(await getForStationery(clientB, await actor(ownerB), stationeryB, code)).toBeNull();
    expect(await getForStationery(clientB, await actor(ownerB), stationeryA, code)).toBeNull();
    expect((await listForStationery(clientB, await actor(ownerB), stationeryA)).rows).toEqual([]);
  });

  it("quem não tem relação não muda o lead e recebe o mesmo not_found de um código inexistente", async () => {
    const attempts = [
      transitionLead(admin, await actor(ownerB), { code, to: "in_progress", as: "stationery" }),
      transitionLead(admin, await actor(otherParentId), { code, to: "cancelled", as: "parent" }),
      transitionLead(admin, await actor(parentId), { code, to: "in_progress", as: "stationery" }),
      transitionLead(admin, await actor(ownerA), { code, to: "cancelled", as: "admin" }),
      markViewed(admin, await actor(ownerB), code),
      transitionLead(admin, await actor(ownerA), { code: "LC-ZZZZ", to: "in_progress", as: "stationery" }),
    ];
    const results = await Promise.all(attempts.map((p) => errorCode(p).catch((e: unknown) => String(e))));
    expect(results[0]).toBe("not_found");
    expect(results[1]).toBe("not_found");
    expect(results[2]).toBe("not_found");
    expect(results[3]).toBe("forbidden"); // ator admin sem papel admin: recusado antes do banco
    expect(results[4]).toBe("not_found");
    expect(results[5]).toBe("not_found");
  });

  it("funil: visto, cotação com valor, venda declarada; eventos na ordem", async () => {
    expect(await markViewed(admin, await actor(ownerA), code)).toBe("viewed");
    expect(await markViewed(admin, await actor(ownerA), code)).toBe("viewed");
    expect(await transitionLead(admin, await actor(ownerA), { code, to: "quote_sent", as: "stationery", amountCents: 123_450 })).toBe("quote_sent");
    expect(await errorCode(transitionLead(admin, await actor(ownerA), { code, to: "quote_sent", as: "stationery" }))).toBe("transition_not_allowed");
    expect(await errorCode(transitionLead(admin, await actor(ownerA), { code, to: "in_progress", as: "stationery", amountCents: 5 }))).toBe("amount_invalid");
    expect(await transitionLead(admin, await actor(ownerA), { code, to: "converted", as: "stationery", amountCents: 150_000 })).toBe("converted");

    const detail = await getForStationery(clientA, await actor(ownerA), stationeryA, code);
    expect(detail?.lead).toMatchObject({ status: "converted", quotedTotalCents: 123_450, declaredSaleCents: 150_000 });
    expect(detail?.lead.saleDeclaredAt).toBeInstanceOf(Date);
    expect(detail?.events.map((e) => e.eventType)).toEqual(["created", "viewed", "quote_registered", "sale_declared"]);
    expect(detail?.events.map((e) => e.actorRole)).toEqual(["parent", "stationery", "stationery", "stationery"]);
    // terminal: nada mais muda
    expect(await errorCode(transitionLead(admin, await actor(ownerA), { code, to: "declined", as: "stationery", reason: "price" }))).toBe("transition_not_allowed");
    expect(await errorCode(transitionLead(admin, await actor(parentId), { code, to: "cancelled", as: "parent" }))).toBe("transition_not_allowed");
  });

  it("visão do solicitante: lista, detalhe com cartId e reason, alheio some", async () => {
    const second = await createLead(admin, await actor(parentId), record(cart, stationeryA));
    const mine = await listForRequester(admin, await actor(parentId));
    expect(mine.map((l) => l.code)).toContain(code);
    expect(mine.find((l) => l.code === second.code)).toMatchObject({ cartId: cart, stationeryName: "Papelaria Teste", status: "received", quotedTotalCents: null });
    expect(await listForRequester(admin, await actor(otherParentId))).toEqual([]);
    expect(await getForRequester(admin, await actor(otherParentId), second.code)).toBeNull();
    expect(await getForRequester(admin, await actor(parentId), "lixo")).toBeNull();

    // equipe cancela por abuso com motivo: só o solicitante (service_role) lê o texto
    expect(await errorCode(transitionLead(admin, await actor(adminId), { code: second.code, to: "cancelled", as: "admin" }))).toBe("reason_required");
    expect(await transitionLead(admin, await actor(adminId), { code: second.code, to: "cancelled", as: "admin", reason: "abuso comprovado pela equipe" })).toBe("cancelled");
    const detail = await getRequesterDetail(admin, await actor(parentId), second.code);
    expect(detail?.lead.status).toBe("cancelled");
    expect(detail?.events.at(-1)).toMatchObject({ eventType: "cancelled", actorRole: "admin", reason: "abuso comprovado pela equipe" });
    const seen = await getForStationery(clientA, await actor(ownerA), stationeryA, second.code);
    expect(JSON.stringify(seen)).not.toContain("abuso comprovado");
  });

  it("solicitante cancela o próprio lead; depois disso o WhatsApp não abre", async () => {
    const rec = record(await newCart(parentId), stationeryA);
    const created = await createLead(admin, await actor(parentId), rec);
    expect(await recordWhatsappOpen(admin, await actor(parentId), created.leadId)).toBe(true);
    expect(await recordWhatsappOpen(admin, await actor(parentId), created.leadId)).toBe(false); // dedupe de 60 s
    expect(await errorCode(recordWhatsappOpen(admin, await actor(otherParentId), created.leadId))).toBe("forbidden");
    expect(await transitionLead(admin, await actor(parentId), { code: created.code, to: "cancelled", as: "parent" })).toBe("cancelled");
    expect(await errorCode(recordWhatsappOpen(admin, await actor(parentId), created.leadId))).toBe("invalid_state");
    const detail = await getRequesterDetail(admin, await actor(parentId), created.code);
    expect(detail?.events.map((e) => e.eventType)).toEqual(["created", "whatsapp_opened", "cancelled"]);
  });

  it("expireDue expira lead vencido; transição depois devolve expired (sem erro do banco)", async () => {
    const { code: dueCode } = await withSuperuser((c) => seedLead(c, { stationeryId: stationeryA, requesterId: parentId, status: "received", expiresIn: "-1 day" }));
    const n = await expireDue(admin);
    expect(n).toBeGreaterThanOrEqual(1);
    const detail = await getForStationery(clientA, await actor(ownerA), stationeryA, dueCode);
    expect(detail?.lead.status).toBe("expired");
    expect(detail?.events.at(-1)).toMatchObject({ eventType: "expired", actorRole: "system" });
    expect(await transitionLead(admin, await actor(ownerA), { code: dueCode, to: "in_progress", as: "stationery" })).toBe("expired");
    expect(await expireDue(admin)).toBe(0);
    const lazy = await withSuperuser((c) => seedLead(c, { stationeryId: stationeryA, requesterId: parentId, status: "quote_sent", expiresIn: "-1 minute" }));
    expect(await transitionLead(admin, await actor(ownerA), { code: lazy.code, to: "converted", as: "stationery" })).toBe("expired");
  });

  it("getStationeryPublic: só papelaria active", async () => {
    expect(await getStationeryPublic(admin, stationeryA)).toMatchObject({ id: stationeryA, name: "Papelaria Teste", whatsapp: "+5565999990000", isDemo: false });
    const paused = await newStationery(await makeUser("ownerP", "stationery_member"), { status: "paused" });
    expect(await getStationeryPublic(admin, paused)).toBeNull();
  });

  it("listCandidateStationeries: só active na área, com catálogo para a estimativa", async () => {
    const owner = await makeUser("ownerC", "stationery_member");
    const inArea = await newStationery(owner, { neighborhood: "São José" });
    const far = await newStationery(await makeUser("ownerD", "stationery_member"), { neighborhood: "Bairro Distante" });
    const paused = await newStationery(await makeUser("ownerE", "stationery_member"), { status: "paused", neighborhood: "São José" });
    await withSuperuser(async (c) => {
      for (const s of [inArea, paused]) {
        await c.query(
          "insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status) values ($1, 'Caderno 96 folhas', 'caderno 96 folhas', 1500, 'in_stock')",
          [s],
        );
      }
      await c.query("insert into public.stationery_areas (stationery_id, municipality_id, neighborhood, display_name) values ($1, $2, 'jardim novo', 'Jardim Novo')", [far, municipalityId]);
    });
    const found = await listCandidateStationeries(admin, await actor(parentId), { municipalityId, neighborhood: "sao jose", itemKeys: ["caderno 96 folhas", "lapis hb"] });
    const ids = found.map((o) => o.id);
    expect(ids).toContain(inArea);
    expect(ids).not.toContain(far);
    expect(ids).not.toContain(paused);
    const option = found.find((o) => o.id === inArea);
    expect(JSON.stringify(option)).not.toContain("whatsapp");
    const estimate = estimateFromCatalog(
      [
        { itemKey: "caderno 96 folhas", name: "Caderno 96 folhas", quantity: 2 },
        { itemKey: "lapis hb", name: "Lápis HB", quantity: 12 },
      ],
      option?.candidates ?? [],
      new Date(),
    );
    expect(estimate).toMatchObject({ status: "partial", subtotalCents: 3000, pricedCount: 1, totalCount: 2, source: "informed_by_stationery" });
    const viaArea = await listCandidateStationeries(admin, await actor(parentId), { municipalityId, neighborhood: "Jardim Novo", itemKeys: [] });
    expect(viaArea.map((o) => o.id)).toContain(far);
  });
});

describe("LeadService de ponta a ponta contra o banco", () => {
  it("consentimento, carrinho alheio, criação idempotente, WhatsApp e cancelamento", async () => {
    const parent = await makeUser("svc-parent");
    const stranger = await makeUser("svc-stranger");
    const owner = await makeUser("svc-owner", "stationery_member");
    const stationery = await newStationery(owner);
    const cartId = await newCart(parent);
    const listId = randomUUID();
    await withSuperuser((c) => c.query("update public.carts set list_id = $2 where id = $1", [cartId, listId]));
    const service = new LeadService({
      store: createLeadStore(admin),
      carts: {
        async getOwnedCart(a, id) {
          const c = await getCart(admin, id);
          if (!c || c.ownerId !== a.userId) return null;
          return { id: c.id, ownerId: c.ownerId, listId: c.listId, isDemo: c.isDemo, items: c.items.map((i) => ({ name: i.name, itemKey: i.itemKey, quantity: i.quantity })) };
        },
      },
      contexts: new InMemoryLeadListContextReader(new Map([[listId, { schoolName: "Escola Demonstração", gradeLabel: "5º ano", schoolYear: 2027, items: [], isDemo: true }]])),
      notifier: new NoopLeadNotifier(),
      now: () => new Date(),
      siteOrigin: () => "https://listacerta.example",
    });
    const input = { cartId, stationeryId: stationery, consent: true, idempotencyKey: randomUUID() };

    expect(await errorCode(service.createLead(await actor(parent), { ...input, consent: false }))).toBe("consent_required");
    expect(await errorCode(service.createLead(await actor(stranger), input))).toBe("not_found");
    const created = await service.createLead(await actor(parent), input);
    expect(created.created).toBe(true);
    expect((await service.createLead(await actor(parent), input)).code).toBe(created.code);
    // outro envio (nova chave) para a mesma papelaria e lista devolve o lead aberto
    const dup = await service.createLead(await actor(parent), { ...input, idempotencyKey: randomUUID() });
    expect(dup).toMatchObject({ code: created.code, created: false });

    const consents = await withSuperuser((c) => c.query("select count(*)::int as n from public.consents where profile_id = $1 and purpose = 'lead_whatsapp_quote'", [parent]));
    expect(consents.rows[0].n).toBe(1);

    const { url } = await service.openWhatsapp(await actor(parent), created.code);
    const parsed = new URL(url);
    expect(parsed.host).toBe("wa.me");
    expect(parsed.pathname).toBe("/5565999990000");
    const text = decodeURIComponent(parsed.searchParams.get("text") ?? "");
    expect(text).toContain(created.code);
    expect(text).not.toContain(emails.get(parent) ?? "@@");
    expect(text).not.toContain("Teste svc-parent");
    expect(await errorCode(service.openWhatsapp(await actor(stranger), created.code))).toBe("not_found");

    expect(await service.cancelLead(await actor(parent), { code: created.code })).toBe("cancelled");
    expect(await errorCode(service.openWhatsapp(await actor(parent), created.code))).toBe("invalid_state");
  });
});
