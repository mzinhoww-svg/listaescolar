import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { getSessionActor, type SessionActor } from "@/features/stationeries/actor";
import { normalizeItemKey } from "@/features/cart/item-key";
import { parseCatalogCsv } from "@/features/stationeries/catalog-csv";
import { CatalogLocalQuoteProvider } from "@/features/stationeries/local-quote-provider";
import {
  createLocalCatalogSource,
  getOwnStationery,
  getPublicProfile,
  listCatalogItems,
  listForAdmin,
  recordConsent,
  registerStationery,
  setAreas,
  StationeryRepositoryError,
  transition,
  updateProfile,
  upsertCatalogItems,
} from "@/features/stationeries/repository";
import { LGPD_TEXT_VERSION, StationeryRegistrationSchema } from "@/features/stationeries/schemas";
import {
  canTransition,
  STATIONERY_STATUSES,
  TRANSITION_ACTORS,
  type StationeryStatus,
  type TransitionActor,
} from "@/features/stationeries/state";

import { purgeStationeries, seedStationery, withSuperuser } from "../db/helpers";
import { makeCnpj } from "./helpers";

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
  return {
    url,
    publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secret: get("SUPABASE_SECRET_KEY"),
  };
}

const RUN = `${Date.now() % 1_000_000}`;
let seq = 0;
const nextCnpj = (): string => {
  seq += 1;
  return makeCnpj(`${RUN.padStart(6, "0")}${String(seq).padStart(2, "0")}0001`);
};

let admin: SupabaseClient;
let anon: SupabaseClient;
let municipalityId: string;
const userIds: string[] = [];
const stationeryIds: string[] = [];

type TestRole = "parent" | "admin" | "system" | "stationery_member" | "school_member";
const roles = new Map<string, TestRole>();

/** Único jeito de obter um ator: passa por getSessionActor (com a sessão simulada), como nas Server Actions. */
async function actor(userId: string, role?: TestRole): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = role ?? roles.get(userId) ?? "parent";
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

async function makeUser(label: string, role: "parent" | "admin" | "system" = "parent"): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email: `st-${label}-${RUN}@example.test`,
    password: "senha-de-teste-local-123",
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  userIds.push(id);
  roles.set(id, role);
  await withSuperuser((c) =>
    c.query(
      `insert into public.profiles (id, role, display_name) values ($1, $2, $3)
       on conflict (id) do update set role = excluded.role`,
      [id, role, `Teste ${label}`],
    ),
  );
  return id;
}

const registration = (over: { neighborhood?: string; areas?: string[] } = {}) =>
  StationeryRegistrationSchema.parse({
    basics: {
      tradeName: "Papelaria Repo Teste",
      legalName: "Papelaria Repo Teste LTDA",
      cnpj: nextCnpj(),
      municipalityId,
      neighborhood: over.neighborhood ?? "Centro",
      cep: "78005-000",
    },
    service: {
      whatsapp: "(65) 99999-8888",
      phone: "(65) 3333-4444",
      email: "contato@papelaria-repo.example.test",
      offersPickup: true,
      areas: over.areas ?? ["Jardim das Flores"],
    },
    consent: { lgpdAccepted: true },
  });

async function register(ownerId: string, over: Parameters<typeof registration>[0] = {}) {
  const r = registration(over);
  const created = await registerStationery(admin, await actor(ownerId), r);
  stationeryIds.push(created.id);
  return { ...created, cnpj: r.basics.cnpj };
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StationeryRepositoryError);
  expect((err as StationeryRepositoryError).code).toBe(code);
}

beforeAll(async () => {
  const env = localEnv();
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  admin = createClient(env.url, env.secret, opts);
  anon = createClient(env.url, env.publishable, opts);
  municipalityId = await withSuperuser(async (c) => {
    const r = await c.query("select id from public.municipalities order by ibge_code limit 1");
    return r.rows[0].id as string;
  });
});

afterAll(async () => {
  await purgeStationeries(stationeryIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

describe("matriz TS x banco (stationery_transition)", () => {
  it("canTransition/transitionTable coincidem com a função SQL em todas as 192 combinações", async () => {
    const owner = await makeUser("matrix-owner");
    const adminId = await makeUser("matrix-admin", "admin");
    const systemId = await makeUser("matrix-system", "system");
    const mismatches: string[] = [];
    for (const actorRole of TRANSITION_ACTORS) {
      for (const from of STATIONERY_STATUSES) {
        for (const to of STATIONERY_STATUSES) {
          const id = await withSuperuser(async (c) => {
            await c.query("begin");
            const sid = await seedStationery(c, {
              status: from,
              ownerId: owner,
              pausedBy: from === "paused" ? "owner" : null,
            });
            await c.query("commit");
            return sid;
          });
          const actorId = actorRole === "owner" ? owner : actorRole === "admin" ? adminId : systemId;
          let allowed = true;
          let code = "";
          try {
            const who = await actor(actorId, actorRole === "owner" ? "parent" : actorRole);
            await transition(admin, who, { id, to, reason: "motivo de teste" });
          } catch (e) {
            allowed = false;
            code = e instanceof StationeryRepositoryError ? e.code : String(e);
          }
          if (allowed !== canTransition(actorRole, from, to)) mismatches.push(`${actorRole}: ${from} -> ${to} (banco=${allowed} ${code})`);
          if (!allowed && code !== "transition_not_allowed") mismatches.push(`${actorRole}: ${from} -> ${to} erro inesperado ${code}`);
          await purgeStationeries([id]);
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 240_000);
});

describe("cadastro, transições, perfil público, catálogo e cotação local", () => {
  let ownerId: string;
  let otherId: string;
  let adminId: string;
  let systemId: string;
  let st: { id: string; slug: string; cnpj: string };
  const CADERNO = "Caderno 96 folhas";
  const csv = `nome,preco,estoque\n${CADERNO},"12,50",sim\nLápis HB,"1,99",\nCola branca,"3,00",nao\n`;

  const otherOwnerless = (): string => otherId; // usuário sem vínculo com a papelaria do teste
  beforeAll(async () => {
    ownerId = await makeUser("flow-owner");
    otherId = await makeUser("flow-other");
    adminId = await makeUser("flow-admin", "admin");
    systemId = await makeUser("flow-system", "system");
  });

  it("registra em signup com dono, áreas, contato e aceite", async () => {
    st = await register(ownerId);
    const own = await getOwnStationery(admin, ownerId);
    expect(own).toMatchObject({ id: st.id, status: "signup", cnpj: st.cnpj });
    const { data } = await admin.from("stationeries").select("whatsapp, lgpd_accepted_at, lgpd_text_version").eq("id", st.id).single();
    expect(data?.whatsapp).toBe("+5565999998888");
    expect(data?.lgpd_text_version).toBe(LGPD_TEXT_VERSION); // constante do servidor
    expect(Math.abs(Date.now() - new Date(String(data?.lgpd_accepted_at)).getTime())).toBeLessThan(60_000); // carimbo do servidor
    const areas = await admin.from("stationery_areas").select("neighborhood").eq("stationery_id", st.id);
    expect(areas.data?.map((a) => a.neighborhood)).toEqual(["jardim das flores"]);
  });

  it("duplo envio (mesmo dono, mesmo CNPJ) devolve a papelaria existente, sem duplicar", async () => {
    const again = registration();
    again.basics.cnpj = st.cnpj;
    const r = await registerStationery(admin, await actor(ownerId), again);
    expect(r).toMatchObject({ id: st.id, slug: st.slug, created: false });
    const rows = await admin.from("stationeries").select("id").eq("cnpj", st.cnpj);
    expect(rows.data).toHaveLength(1);
  });

  it("registro é atômico: falha nas áreas não deixa papelaria nem vínculo", async () => {
    const fresh = await makeUser("atomic-owner");
    const r = registration();
    r.service.areas = ["x".repeat(130)]; // viola o limite de 120 do banco
    await expect(registerStationery(admin, await actor(fresh), r)).rejects.toBeInstanceOf(StationeryRepositoryError);
    expect((await admin.from("stationeries").select("id").eq("cnpj", r.basics.cnpj)).data).toEqual([]);
    expect(await getOwnStationery(admin, fresh)).toBeNull();
  });

  it("consentimento: sem versão o banco recusa; recordConsent grava o aceite depois (dono, estado certo)", async () => {
    const owner2 = await makeUser("consent-owner");
    const { error } = await admin.rpc("stationery_register", {
      p_owner_id: owner2,
      p_slug: "sem-consentimento",
      p_trade_name: "Sem Consentimento",
      p_legal_name: "Sem Consentimento LTDA",
      p_cnpj: nextCnpj(),
      p_municipality_id: municipalityId,
      p_neighborhood: "Centro",
      p_lgpd_text_version: null,
    });
    expect(error?.hint).toBe("consent_required");
    expect(await getOwnStationery(admin, owner2)).toBeNull();

    const id = await withSuperuser(async (c) => {
      await c.query("begin");
      const sid = await seedStationery(c, { status: "accreditation", ownerId: owner2, complete: true });
      await c.query("update public.stationeries set lgpd_accepted_at = null, lgpd_text_version = null where id = $1", [sid]);
      await c.query("commit");
      return sid;
    });
    stationeryIds.push(id);
    await expectCode(transition(admin, await actor(owner2), { id, to: "under_review" }), "precondition_failed"); // sem aceite
    await expectCode(recordConsent(admin, await actor(otherOwnerless()), id), "forbidden");
    await recordConsent(admin, await actor(owner2), id);
    const row = await admin.from("stationeries").select("lgpd_accepted_at, lgpd_text_version").eq("id", id).single();
    expect(row.data?.lgpd_text_version).toBe(LGPD_TEXT_VERSION);
    expect(row.data?.lgpd_accepted_at).toBeTruthy();
    expect(await transition(admin, await actor(owner2), { id, to: "under_review" })).toBe("under_review");
    await expectCode(recordConsent(admin, await actor(owner2), id), "invalid_state"); // em análise: travado
  });

  it("CNPJ duplicado e segundo cadastro do mesmo dono não deixam sobra", async () => {
    const dup = registration();
    dup.basics.cnpj = st.cnpj;
    await expectCode(registerStationery(admin, await actor(otherId), dup), "cnpj_taken");
    const fresh = registration();
    await expectCode(registerStationery(admin, await actor(ownerId), fresh), "already_owner");
    const left = await admin.from("stationeries").select("id").eq("cnpj", fresh.basics.cnpj);
    expect(left.data).toEqual([]);
  });

  it("slug repetido ganha sufixo", async () => {
    const other = await register(otherId);
    expect(other.slug).not.toBe(st.slug);
    expect(other.slug.startsWith(st.slug)).toBe(true);
    await purgeStationeries([other.id]);
  });

  it("dono edita cadastro e áreas; terceiro não; catálogo ainda não", async () => {
    await updateProfile(admin, await actor(ownerId), st.id, { openingHours: "Seg a sex, 8h às 18h", offersDelivery: true });
    await expectCode(updateProfile(admin, await actor(otherId), st.id, { openingHours: "x" }), "forbidden");
    await setAreas(admin, await actor(ownerId), st.id, ["Jardim das Flores", "  Centro Sul ", "São José", "sao jose"]);
    await expectCode(setAreas(admin, await actor(otherId), st.id, ["x"]), "forbidden");
    const areas = await admin.from("stationery_areas").select("neighborhood, display_name").eq("stationery_id", st.id).order("neighborhood");
    // chave normalizada (sem acento, minúscula) + texto de exibição preservado; "sao jose" repetido não duplica
    expect(areas.data?.map((a) => [a.neighborhood, a.display_name])).toEqual([
      ["centro sul", "Centro Sul"],
      ["jardim das flores", "Jardim das Flores"],
      ["sao jose", "São José"],
    ]);
    // revalidação do patch: valor inválido e campo fora da lista são recusados antes do banco
    await expectCode(updateProfile(admin, await actor(ownerId), st.id, { whatsapp: "123" }), "invalid_input");
    await expectCode(updateProfile(admin, await actor(ownerId), st.id, { email: "x" }), "invalid_input");
    await expectCode(updateProfile(admin, await actor(ownerId), st.id, { status: "active" } as never), "invalid_input");
    await expectCode(updateProfile(admin, await actor(ownerId), st.id, { constructor: "x" } as never), "invalid_input");
    await expectCode(upsertCatalogItems(admin, await actor(ownerId), st.id, [{ name: CADERNO, priceCents: 1250 }]), "invalid_state");
  });

  it("transições: dono envia, terceiro não age como dono, admin decide, motivo obrigatório", async () => {
    await expectCode(transition(admin, await actor(otherId), { id: st.id, to: "accreditation" }), "forbidden");
    await expectCode(transition(admin, await actor(ownerId), { id: st.id, to: "approved" }), "transition_not_allowed");
    expect(await transition(admin, await actor(ownerId), { id: st.id, to: "accreditation" })).toBe("accreditation");
    expect(await transition(admin, await actor(ownerId), { id: st.id, to: "under_review" })).toBe("under_review");
    await expectCode(transition(admin, await actor(adminId), { id: st.id, to: "rejected" }), "reason_required");
    await expectCode(transition(admin, await actor(ownerId, "admin"), { id: st.id, to: "approved" }), "forbidden");
    expect(await transition(admin, await actor(adminId), { id: st.id, to: "approved" })).toBe("approved");
    const role = await withSuperuser((c) => c.query("select role from public.profiles where id = $1", [ownerId]));
    expect(role.rows[0].role).toBe("stationery_member");
    const listed = await listForAdmin(admin, { status: "approved" });
    expect(listed.some((r) => r.id === st.id)).toBe(true);
  });

  it("antes de publicar não há perfil público; CSV -> catálogo é idempotente por item_key", async () => {
    expect(await getPublicProfile(anon, st.slug)).toBeNull();
    const parsed = parseCatalogCsv(new TextEncoder().encode(csv));
    if (!parsed.ok) throw new Error("csv");
    expect(parsed.errors).toEqual([]);
    const items = parsed.items.map((i) => ({ name: i.name, priceCents: i.priceCents, stock: i.stock }));
    expect(await upsertCatalogItems(admin, await actor(ownerId), st.id, items)).toEqual({ upserted: 3 });
    const first = await listCatalogItems(admin, await actor(ownerId), st.id);
    expect(first).toHaveLength(3);
    await new Promise((r) => setTimeout(r, 20));
    // segundo envio, com um preço novo e o mesmo nome escrito de outro jeito
    await upsertCatalogItems(admin, await actor(ownerId), st.id, [
      ...items,
      { name: "  caderno   96 FOLHAS ", priceCents: 1300, stock: "in_stock" },
    ]);
    const second = await listCatalogItems(admin, await actor(ownerId), st.id);
    expect(second).toHaveLength(3);
    const caderno = second.find((i) => i.itemKey === normalizeItemKey(CADERNO));
    expect(caderno?.priceCents).toBe(1300);
    expect(caderno?.priceSource).toBe("informed_by_stationery");
    expect(caderno!.priceUpdatedAt.getTime()).toBeGreaterThan(first.find((i) => i.itemKey === caderno!.itemKey)!.priceUpdatedAt.getTime());
    // reenviar só com estoque diferente NÃO renova a data do preço (o banco só renova quando o preço muda)
    const secondBatch = [...items, { name: "  caderno   96 FOLHAS ", priceCents: 1300, stock: "in_stock" as const }];
    const before = new Map(second.map((i) => [i.itemKey, i]));
    await new Promise((r) => setTimeout(r, 20));
    await upsertCatalogItems(admin, await actor(ownerId), st.id, secondBatch.map((i) => ({ ...i, stock: "out_of_stock" as const })));
    const third = await listCatalogItems(admin, await actor(ownerId), st.id);
    for (const row of third) {
      expect(row.stock).toBe("out_of_stock");
      expect(row.priceUpdatedAt.getTime(), row.itemKey).toBe(before.get(row.itemKey)!.priceUpdatedAt.getTime());
    }
    await upsertCatalogItems(admin, await actor(ownerId), st.id, secondBatch); // volta ao estado anterior (estoque)
    await expectCode(upsertCatalogItems(admin, await actor(otherId), st.id, items), "forbidden");
    await expectCode(upsertCatalogItems(admin, await actor(ownerId), st.id, [{ name: "X", priceCents: 0 }]), "invalid_input");
  });

  it("publicada: perfil público sem dados sensíveis; cotação local respeita regras", async () => {
    expect(await transition(admin, await actor(ownerId), { id: st.id, to: "active" })).toBe("active");
    for (const client of [anon, admin]) {
      const p = await getPublicProfile(client, st.slug);
      expect(p).not.toBeNull();
      expect(p?.whatsapp).toBe("+5565999998888");
      expect(p?.areas).toEqual(["Centro Sul", "Jardim das Flores", "São José"]); // texto de exibição
      expect(p?.catalog.map((i) => i.priceSource)).toEqual(["informed_by_stationery", "informed_by_stationery", "informed_by_stationery"]);
      const keys = Object.keys(p ?? {});
      for (const forbidden of ["cnpj", "legalName", "email", "phone", "statusReason", "status", "members", "events"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
    // o cliente anon não lê a tabela-base
    const base = await anon.from("stationeries").select("id").eq("id", st.id);
    expect(base.data ?? []).toEqual([]);

    const NOW = new Date();
    const items = [CADERNO, "Cola branca", "Tesoura"].map((name) => ({ itemKey: normalizeItemKey(name), name, quantity: 1 }));
    const source = createLocalCatalogSource(admin);
    const local = (hood?: string) =>
      new CatalogLocalQuoteProvider(source, { municipalityId, ...(hood ? { neighborhood: hood } : {}) });

    const quotes = await local("Jardim das Flores").getQuotes(items, { now: NOW });
    // Cola branca está fora de estoque; Tesoura não existe no catálogo
    expect(quotes.map((q) => q.itemKey)).toEqual([normalizeItemKey(CADERNO)]);
    expect(quotes[0]).toMatchObject({ stationeryId: st.id, unitPriceCents: 1300, source: "informed_by_stationery", inStock: true });
    expect(quotes[0]?.checkedAt).toBeInstanceOf(Date);
    // acento e caixa não atrapalham
    expect(await local("SÃO JOSÉ").getQuotes(items, { now: NOW })).toHaveLength(1);
    expect(await local("sao jose").getQuotes(items, { now: NOW })).toHaveLength(1);
    // bairro que a papelaria não atende
    expect(await local("Coxipó").getQuotes(items, { now: NOW })).toEqual([]);
    // município da papelaria + bairro da própria papelaria
    expect(await local("Centro").getQuotes(items, { now: NOW })).toHaveLength(1);
    // preço velho (validade de 30 dias) é omitido
    const later = new Date(NOW.getTime() + 31 * 24 * 3_600_000);
    expect(await local("Jardim das Flores").getQuotes(items, { now: later })).toEqual([]);
    // item inativo é omitido
    await admin.from("catalog_items").update({ is_active: false }).eq("stationery_id", st.id).eq("item_key", normalizeItemKey(CADERNO));
    expect(await local("Jardim das Flores").getQuotes(items, { now: NOW })).toEqual([]);
    await admin.from("catalog_items").update({ is_active: true }).eq("stationery_id", st.id).eq("item_key", normalizeItemKey(CADERNO));
    expect(await local("Jardim das Flores").getQuotes(items, { now: NOW })).toHaveLength(1);
  });

  it("pausada ou suspensa: some do perfil público e da cotação", async () => {
    const items = [{ itemKey: normalizeItemKey(CADERNO), name: CADERNO, quantity: 1 }];
    const provider = new CatalogLocalQuoteProvider(createLocalCatalogSource(admin), { municipalityId, neighborhood: "Centro" });
    await transition(admin, await actor(adminId), { id: st.id, to: "paused" });
    expect(await getPublicProfile(anon, st.slug)).toBeNull();
    expect(await provider.getQuotes(items)).toEqual([]);
    // pausada pela equipe: o dono não reativa
    await expectCode(transition(admin, await actor(ownerId), { id: st.id, to: "active" }), "transition_not_allowed");
    await transition(admin, await actor(adminId), { id: st.id, to: "active" });
    expect(await provider.getQuotes(items)).toHaveLength(1);
    await expectCode(transition(admin, await actor(systemId), { id: st.id, to: "suspended" }), "reason_required");
    await transition(admin, await actor(systemId), { id: st.id, to: "suspended", reason: "denúncia em análise" });
    expect(await getPublicProfile(anon, st.slug)).toBeNull();
    expect(await provider.getQuotes(items)).toEqual([]);
    const own = await getOwnStationery(admin, ownerId);
    expect(own).toMatchObject({ status: "suspended", statusReason: "denúncia em análise" });
  });
});

describe("estados aceitos no tipo", () => {
  it("TransitionActor e StationeryStatus cobrem a matriz", () => {
    const a: TransitionActor[] = [...TRANSITION_ACTORS];
    const s: StationeryStatus[] = [...STATIONERY_STATUSES];
    expect(a).toHaveLength(3);
    expect(s).toHaveLength(8);
  });
});

describe("mapeamento de erros distinto por causa", () => {
  it("motivo, ator inválido, pré-condição e transição não permitida têm códigos próprios", async () => {
    const owner = await makeUser("err-owner");
    const adm = await makeUser("err-admin", "admin");
    const id = await withSuperuser(async (c) => {
      await c.query("begin");
      const sid = await seedStationery(c, { status: "signup", ownerId: owner, complete: false });
      await c.query("commit");
      return sid;
    });
    stationeryIds.push(id);
    // pré-condição do envio (dados incompletos) x transição fora da matriz x ator inválido x motivo
    await expectCode(transition(admin, await actor(owner), { id, to: "accreditation" }), "precondition_failed");
    await expectCode(transition(admin, await actor(owner), { id, to: "active" }), "transition_not_allowed");
    const bogus = await admin.rpc("stationery_transition", { p_id: id, p_to: "accreditation", p_actor_id: owner, p_actor_role: "bogus" });
    expect(bogus.error?.code).toBe("22023");
    expect(bogus.error?.hint).toBe("actor_invalid");
    await expectCode(transition(admin, await actor(adm), { id, to: "suspended" }), "reason_required");
  });
});

describe("candidatos da cotação local (I1): sem truncar em silêncio", () => {
  it("devolve todos os candidatos acima de 1000 linhas e falha alto no limite", async () => {
    const owner = await makeUser("bulk-owner");
    const N = 1200;
    const id = await withSuperuser(async (c) => {
      await c.query("begin");
      const sid = await seedStationery(c, { status: "active", ownerId: owner });
      await c.query(
        `insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status)
         select $1, 'Item ' || g, 'item-bulk-' || g, 100 + g, case when g % 2 = 0 then 'in_stock'::public.catalog_stock_status else 'unknown' end
           from generate_series(1, $2::int) g`,
        [sid, N],
      );
      await c.query("update public.catalog_items set stock_status = 'out_of_stock' where stationery_id = $1 and item_key = 'item-bulk-1'", [sid]);
      await c.query("commit");
      return sid;
    });
    stationeryIds.push(id);
    const keys = Array.from({ length: N }, (_, i) => `item-bulk-${i + 1}`);
    const rows = await createLocalCatalogSource(admin).findCandidates({ itemKeys: keys, location: { municipalityId } });
    const mine = rows.filter((r) => r.stationeryId === id);
    expect(mine).toHaveLength(N - 1); // item-bulk-1 está fora de estoque: o SQL já não o devolve
    expect(new Set(mine.map((r) => r.itemKey)).size).toBe(N - 1);
    // lista do dono acima de 1000 itens: paginada, completa
    expect(await listCatalogItems(admin, await actor(owner), id)).toHaveLength(N);
    // limite atingido: erro claro, nunca lista parcial
    await expect(
      createLocalCatalogSource(admin, { limit: 100 }).findCandidates({ itemKeys: keys, location: { municipalityId } }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
    // município sem papelaria: nada
    const none = await createLocalCatalogSource(admin).findCandidates({ itemKeys: keys, location: { municipalityId: "00000000-0000-4000-8000-000000000000" } });
    expect(none).toEqual([]);
  }, 120_000);
});
