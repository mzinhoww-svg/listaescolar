import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { PayoutError } from "@/features/payouts/errors";
import { createPayoutStore } from "@/features/payouts/repository";
import { getSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { cleanupUsers, ensureSchool, IDS, seedLead, seedStationery, seedUsers, withSuperuser } from "../db/helpers";
import { purgeAllPayoutTestData } from "../db/payout-fixtures";

// Roda em `pnpm test:db`. Mesmo padrão de tests/conversion/repository.test.ts e tests/billing/repository.test.ts:
// cliente de serviço próprio (chaves de `scripts/supa.mjs env`), atores mockados sobre os ids fixos de tests/db/helpers.
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
let stationeryId: string;

async function actor(userId: string, role: string): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = role;
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

beforeAll(async () => {
  const env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  await seedUsers();
  // compartilhada pelos testes de venda (stationery_members_one_owner_per_profile: um dono, uma papelaria).
  stationeryId = await withSuperuser((c) => seedStationery(c, { status: "active", ownerId: IDS.stationery_member }));
});

afterAll(async () => {
  // este arquivo COMMITA de verdade (cliente REST real, sem rollback): sem purgar, as linhas vazam para outros
  // arquivos do `pnpm test:db` (contam a mais em "uma versão ativa por vez") e prendem escolas de fixture.
  await purgeAllPayoutTestData();
  await cleanupUsers();
});

describe("PayoutStore × banco real", () => {
  it("publishSettings/publishSchoolConfig: só admin; leitura devolve o nome real da escola", async () => {
    const store = createPayoutStore(admin);
    const parentActor = await actor(IDS.parent, "parent");
    const adminActor = await actor(IDS.admin, "admin");

    await expect(store.publishSettings(parentActor, { commissionBps: 1000, graceDays: 5, blockDays: 15 })).rejects.toBeInstanceOf(PayoutError);
    await store.publishSettings(adminActor, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
    const settings = await store.getActiveSettings();
    expect(settings).toMatchObject({ commissionBps: 1000, graceDays: 5, blockDays: 15 });

    const schoolId = await withSuperuser((c) => ensureSchool(c));
    await store.publishSchoolConfig(adminActor, { schoolId, target: "apm", payoutBps: 300, beneficiaryName: "APM Teste", pixKey: "apm@teste.invalid", pixKeyKind: "email" });
    const configs = await store.listSchoolConfigs(adminActor);
    const mine = configs.find((c) => c.schoolId === schoolId);
    expect(mine).toMatchObject({ target: "apm", payoutBps: 300, beneficiaryName: "APM Teste", pixKeyKind: "email" });
    expect(mine?.pixKeyMasked).toMatch(/^••••/); // nunca a chave inteira
    expect(mine?.schoolName).toBeTruthy();
  });

  it("confirmSale + listRecentSalePayments: comissão sempre, repasse só com escola configurada; nomes vêm dos joins", async () => {
    const store = createPayoutStore(admin);
    const adminActor = await actor(IDS.admin, "admin");
    await store.publishSettings(adminActor, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
    const schoolId = await withSuperuser((c) => ensureSchool(c));
    await store.publishSchoolConfig(adminActor, { schoolId, target: "school", payoutBps: 200, beneficiaryName: "Escola Teste", pixKey: "escola@teste.invalid", pixKeyKind: "email" });

    const lead = await withSuperuser((c) =>
      seedLead(c, { stationeryId, requesterId: IDS.parent, status: "converted", overrides: { declared_sale_cents: 10000, declared_at: new Date().toISOString(), is_demo: false } }),
    );

    const memberActor = await actor(IDS.stationery_member, "stationery_member");
    const saleId = await store.confirmSale(memberActor, { leadId: lead.id, schoolId });
    expect(saleId).toBeTruthy();

    const rows = await store.listRecentSalePayments(adminActor, 10);
    const mine = rows.find((r) => r.id === saleId);
    expect(mine).toMatchObject({
      leadCode: lead.code,
      commissionCents: 1000,
      repasseCents: 200,
      repasseTarget: "school",
      schoolName: "Escola Fixture",
    });
    expect(mine?.stationeryName).toBeTruthy();
  });

  it("listPendingRepasses + createBatch/markBatchExecuted zera o pendente e fica idempotente", async () => {
    const store = createPayoutStore(admin);
    const adminActor = await actor(IDS.admin, "admin");
    await store.publishSettings(adminActor, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
    const schoolId = await withSuperuser((c) => ensureSchool(c));
    await store.publishSchoolConfig(adminActor, { schoolId, target: "apm", payoutBps: 500, beneficiaryName: "APM 2", pixKey: "apm2@teste.invalid", pixKeyKind: "email" });

    const lead = await withSuperuser((c) =>
      seedLead(c, { stationeryId, requesterId: IDS.parent, status: "converted", overrides: { declared_sale_cents: 20000, declared_at: new Date().toISOString(), is_demo: false } }),
    );
    await store.confirmSale(await actor(IDS.stationery_member, "stationery_member"), { leadId: lead.id, schoolId });

    const pending = await store.listPendingRepasses(adminActor);
    const mine = pending.find((p) => p.schoolId === schoolId);
    expect(mine?.pendingCents).toBe(1000); // 5% de 20000

    const batchId = await store.createBatch(adminActor, { schoolId, beneficiaryType: "apm" });
    const pendingAfter = await store.listPendingRepasses(adminActor);
    expect(pendingAfter.find((p) => p.schoolId === schoolId)).toBeUndefined();

    await expect(store.createBatch(adminActor, { schoolId, beneficiaryType: "apm" })).rejects.toMatchObject({ code: "nothing_due" });

    const batches = await store.listBatches(adminActor, 10);
    expect(batches.find((b) => b.id === batchId)).toMatchObject({ status: "pending", totalCents: 1000, schoolName: "Escola Fixture" });

    const exec1 = await store.markBatchExecuted(adminActor, batchId);
    const exec2 = await store.markBatchExecuted(adminActor, batchId);
    expect(exec1).toBe(exec2);
    const batchesAfter = await store.listBatches(adminActor, 10);
    expect(batchesAfter.find((b) => b.id === batchId)?.status).toBe("executed");
  });

  it("listDelinquency: só admin; devolve o status calculado por payout_admin_delinquency_list", async () => {
    const store = createPayoutStore(admin);
    const memberActor = await actor(IDS.stationery_member, "stationery_member");
    await expect(store.listDelinquency(memberActor)).rejects.toBeInstanceOf(PayoutError);

    const adminActor = await actor(IDS.admin, "admin");
    const rows = await store.listDelinquency(adminActor);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("listSchoolOptions: qualquer ator autenticado lê (nome/id de escola não é dado sensível, não só admin)", async () => {
    const store = createPayoutStore(admin);
    const memberActor = await actor(IDS.stationery_member, "stationery_member");
    const rows = await store.listSchoolOptions(memberActor);
    expect(Array.isArray(rows)).toBe(true);
  });
});
