import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { B2bServiceError } from "@/features/b2b/errors";
import { ALLOWED_SCOPES, PARTNER_TYPES, scopesForPartnerType } from "@/features/b2b/scopes";
import {
  canTransitionPartner,
  PARTNER_STATUSES,
  requiresLiveLimits,
  requiresReason,
  requiresSandboxLimits,
} from "@/features/b2b/states";
import {
  applyPartner,
  adminRevokeKey,
  createKey,
  decide,
  getMyPartner,
  getPartner,
  listPartnerEvents,
  listPartners,
  partnerHeader,
  revokeKey,
  rotateKey,
} from "@/features/b2b/repository";

import { hashSecret, makeCnpj14, publicId, purgePartners, secret, seedKey, seedPartner } from "./b2b-fixtures";
import { IDS, seedUsers, withSuperuser } from "./helpers";

// Roda em `pnpm test:db` (Supabase local da trilha). Chaves lidas de `scripts/supa.mjs env` em tempo de execução.
function localEnv(): { url: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("só roda contra Supabase local");
  return { url, secret: get("SUPABASE_SECRET_KEY") };
}

let admin: SupabaseClient;
const partnerIds: string[] = [];
const userIds: string[] = [];

async function makeUser(label: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email: `b2b-${label}-${Date.now()}@example.test`, password: "senha-de-teste-local-123", email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  userIds.push(id);
  await withSuperuser((c) => c.query(`insert into public.profiles (id, role, display_name) values ($1, 'parent', $2) on conflict (id) do nothing`, [id, `Teste ${label}`]));
  return id;
}

/** Único jeito de obter um ator: passa por getSessionActor, como nas Server Actions. */
async function actorOf(userId: string, role: SessionActor["role"] = "parent"): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = role;
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(B2bServiceError);
  expect((err as B2bServiceError).code).toBe(code);
}

beforeAll(async () => {
  await seedUsers();
  const env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
});

afterAll(async () => {
  await purgePartners(partnerIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

describe("escopos: TS x b2b_allowed_scopes (SQL)", () => {
  for (const type of PARTNER_TYPES) {
    it(`${type}: scopesForPartnerType bate com a função SQL`, async () => {
      const { data, error } = await admin.rpc("b2b_allowed_scopes", { p_type: type });
      expect(error).toBeNull();
      expect(new Set(data as string[])).toEqual(new Set(scopesForPartnerType(type)));
    });
  }
  it("tipo desconhecido devolve array vazio (TS e SQL concordam: nenhum escopo)", async () => {
    const { data } = await admin.rpc("b2b_allowed_scopes", { p_type: "desconhecido" });
    expect(data).toEqual([]);
  });
});

describe("estados: TS x b2b_partner_decide (SQL) — todas as 25 combinações", () => {
  let admActor: SessionActor;
  beforeAll(async () => {
    admActor = await actorOf(IDS.admin, "admin");
  });
  for (const from of PARTNER_STATUSES) {
    for (const to of PARTNER_STATUSES) {
      it(`${from} -> ${to}`, async () => {
        const partnerId = await withSuperuser((c) => seedPartner(c, { status: from, ownerId: null }));
        partnerIds.push(partnerId);
        const allowed = canTransitionPartner(from, to);
        const payload: Record<string, unknown> = { to };
        if (requiresSandboxLimits(to)) {
          payload.plan = "regional";
          payload.testRatePerMinute = 60;
          payload.testRatePerDay = 1000;
        }
        if (requiresLiveLimits(to)) {
          payload.liveRatePerMinute = 60;
          payload.liveRatePerDay = 1000;
        }
        if (requiresReason(to)) payload.reason = "motivo de teste";

        if (allowed) {
          const result = await decide(admin, admActor, partnerId, payload as { to: string });
          expect(result).toBe(to);
        } else {
          await expectCode(decide(admin, admActor, partnerId, payload as { to: string }), "transition_not_allowed");
        }
      });
    }
  }
});

describe("applyPartner", () => {
  it("cadastra: parceiro pending + dono, CNPJ único", async () => {
    const owner = await makeUser("apply-1");
    const actor = await actorOf(owner);
    const cnpj = makeCnpj14();
    const { partnerId } = await applyPartner(admin, actor, { tradeName: "Loja X", legalName: "Loja X LTDA", cnpj, contactName: "Fulano", partnerType: "retailer", coverageUfs: null }, "terms-v1");
    partnerIds.push(partnerId);
    const { data } = await admin.from("b2b_partners").select("status, cnpj").eq("id", partnerId).single();
    expect(data).toMatchObject({ status: "pending", cnpj });
  });

  it("CNPJ duplicado (parceiro não recusado existente) -> duplicate_cnpj", async () => {
    const owner1 = await makeUser("apply-dup-1");
    const owner2 = await makeUser("apply-dup-2");
    const cnpj = makeCnpj14();
    const { partnerId } = await applyPartner(admin, await actorOf(owner1), { tradeName: "A", legalName: "A LTDA", cnpj, contactName: "A", partnerType: "retailer", coverageUfs: null }, "terms-v1");
    partnerIds.push(partnerId);
    await expectCode(
      applyPartner(admin, await actorOf(owner2), { tradeName: "B", legalName: "B LTDA", cnpj, contactName: "B", partnerType: "brand", coverageUfs: null }, "terms-v1"),
      "duplicate_cnpj",
    );
  });

  it("mesma conta cadastra duas vezes -> already_member", async () => {
    const owner = await makeUser("apply-already");
    const actor = await actorOf(owner);
    const { partnerId } = await applyPartner(admin, actor, { tradeName: "C", legalName: "C LTDA", cnpj: makeCnpj14(), contactName: "C", partnerType: "retailer", coverageUfs: null }, "terms-v1");
    partnerIds.push(partnerId);
    await expectCode(
      applyPartner(admin, actor, { tradeName: "D", legalName: "D LTDA", cnpj: makeCnpj14(), contactName: "D", partnerType: "retailer", coverageUfs: null }, "terms-v1"),
      "already_member",
    );
  });
});

describe("chaves: createKey / rotateKey / revokeKey", () => {
  it("varejista pode criar chave com carts:match; marca não pode (scope_not_allowed)", async () => {
    const retailerOwner = await makeUser("key-retailer");
    const retailerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: retailerOwner, type: "retailer" }));
    partnerIds.push(retailerId);
    const ok = await createKey(admin, await actorOf(retailerOwner), retailerId, { environment: "test", publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "abcd", scopes: [...ALLOWED_SCOPES] });
    expect(ok.keyId).toBeTruthy();

    const brandOwner = await makeUser("key-brand");
    const brandId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: brandOwner, type: "brand" }));
    partnerIds.push(brandId);
    await expectCode(
      createKey(admin, await actorOf(brandOwner), brandId, { environment: "test", publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "efgh", scopes: ["carts:match"] }),
      "scope_not_allowed",
    );
  });

  it("live indisponível em sandbox -> environment_not_allowed", async () => {
    const owner = await makeUser("key-env");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: owner }));
    partnerIds.push(partnerId);
    await expectCode(
      createKey(admin, await actorOf(owner), partnerId, { environment: "live", publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "ijkl", scopes: ["schools:read"] }),
      "environment_not_allowed",
    );
  });

  it("terceira chave utilizável no mesmo ambiente -> too_many_keys", async () => {
    const owner = await makeUser("key-toomany");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: owner }));
    partnerIds.push(partnerId);
    const actor = await actorOf(owner);
    await createKey(admin, actor, partnerId, { environment: "test", publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "mnop", scopes: ["schools:read"] });
    await createKey(admin, actor, partnerId, { environment: "test", publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "qrst", scopes: ["schools:read"] });
    await expectCode(
      createKey(admin, actor, partnerId, { environment: "test", publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "uvwx", scopes: ["schools:read"] }),
      "too_many_keys",
    );
  });

  it("rotaciona com carência; chave revogada não rotaciona (key_not_active)", async () => {
    const owner = await makeUser("key-rotate");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: owner }));
    partnerIds.push(partnerId);
    const actor = await actorOf(owner);
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test" }));
    const rotated = await rotateKey(admin, actor, { oldKeyId: key.id, publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "yz12", graceDays: 7 });
    expect(rotated.keyId).toBeTruthy();

    const revokedKey = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", status: "revoked" }));
    await expectCode(
      rotateKey(admin, actor, { oldKeyId: revokedKey.id, publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "3456" }),
      "key_not_active",
    );
  });

  it("revogar é idempotente", async () => {
    const owner = await makeUser("key-revoke");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: owner }));
    partnerIds.push(partnerId);
    const actor = await actorOf(owner);
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test" }));
    await revokeKey(admin, actor, key.id, "motivo");
    await expect(revokeKey(admin, actor, key.id, "motivo de novo")).resolves.toBeUndefined();
  });

  it("membro de outro parceiro tentando revogar/rotacionar chave alheia -> not_found (nunca forbidden)", async () => {
    const ownerA = await makeUser("key-a");
    const ownerB = await makeUser("key-b");
    const partnerBId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: ownerB }));
    partnerIds.push(partnerBId);
    const keyB = await withSuperuser((c) => seedKey(c, partnerBId, { environment: "test" }));
    const actorA = await actorOf(ownerA);
    await expectCode(revokeKey(admin, actorA, keyB.id, "tentativa alheia"), "not_found");
    await expectCode(rotateKey(admin, actorA, { oldKeyId: keyB.id, publicId: publicId(), keyHash: hashSecret(secret()), hashVersion: 1, last4: "7890" }), "not_found");
  });
});

describe("getMyPartner", () => {
  it("dono vê a visão do próprio parceiro; quem não é dono de nenhum vê null", async () => {
    const owner = await makeUser("overview-owner");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "active", ownerId: owner }));
    partnerIds.push(partnerId);
    const view = await getMyPartner(admin, await actorOf(owner));
    expect(view).toMatchObject({ partnerId, status: "active" });

    const outsider = await makeUser("overview-outsider");
    expect(await getMyPartner(admin, await actorOf(outsider))).toBeNull();
  });
});

describe("partnerHeader", () => {
  it("traz os dados de cadastro (Empresa, CNPJ, contato) por id, sem depender de posse (quem chama já resolveu)", async () => {
    const owner = await makeUser("header-owner");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "suspended", ownerId: owner }));
    partnerIds.push(partnerId);
    const header = await partnerHeader(admin, partnerId);
    expect(header).toMatchObject({
      tradeName: "Parceiro Teste",
      legalName: "Parceiro Teste LTDA",
      contactName: "Contato Teste",
      partnerType: "retailer",
      statusReason: "motivo de teste",
      isDemo: false,
    });
    expect(header?.cnpj).toMatch(/^[0-9A-Z]{14}$/);
    expect(await partnerHeader(admin, "00000000-0000-4000-8000-000000000099")).toBeNull();
  });
});

describe("listPartnerEvents", () => {
  it("devolve a linha do tempo do parceiro, mais recente primeiro", async () => {
    const owner = await makeUser("events-owner");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: owner }));
    partnerIds.push(partnerId);
    await withSuperuser((c) =>
      c.query(
        `insert into public.b2b_partner_events (partner_id, event_type, from_status, to_status, actor_role, reason) values
         ($1, 'applied', null, 'pending', 'owner', null),
         ($1, 'decided', 'pending', 'sandbox', 'admin', null)`,
        [partnerId],
      ),
    );
    const events = await listPartnerEvents(admin, partnerId);
    expect(events.map((e) => e.eventType)).toEqual(["decided", "applied"]);
    expect(events[0]).toMatchObject({ fromStatus: "pending", toStatus: "sandbox", actorRole: "admin" });
    expect(events.every((e) => !("actorId" in e))).toBe(true);
  });
});

describe("admin: listPartners / getPartner / decide / adminRevokeKey", () => {
  it("não-admin é recusado (forbidden), sem tocar o banco de forma alguma", async () => {
    const owner = await makeUser("admin-check");
    const actor = await actorOf(owner);
    await expectCode(listPartners(admin, actor), "forbidden");
    await expectCode(getPartner(admin, actor, "00000000-0000-4000-8000-000000000099"), "forbidden");
    await expectCode(adminRevokeKey(admin, actor, "00000000-0000-4000-8000-000000000099"), "forbidden");
  });

  it("admin lista e lê qualquer parceiro; revoga qualquer chave", async () => {
    const owner = await makeUser("admin-target");
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: owner }));
    partnerIds.push(partnerId);
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test" }));
    const admActor = await actorOf(IDS.admin, "admin");

    const rows = await listPartners(admin, admActor);
    expect(rows.some((r) => r.id === partnerId)).toBe(true);

    const view = await getPartner(admin, admActor, partnerId);
    expect(view?.partnerId).toBe(partnerId);

    await adminRevokeKey(admin, admActor, key.id, "revogado pelo admin");
    const { data } = await admin.from("b2b_api_keys").select("status").eq("id", key.id).single();
    expect(data?.status).toBe("revoked");
  });
});
