import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { BillingError } from "@/features/billing/errors";
import type { PlanDraft } from "@/features/billing/ports";
import { resolvePaymentProvider } from "@/features/billing/payments/factory";
import { createBillingStore } from "@/features/billing/repository";
import { BillingService } from "@/features/billing/service";
import { getSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { ensureTestBillingPlan } from "../db/billing-fixtures";
import { IDS, cleanupUsers, purgeLeads, purgeStationeries, seedLead, seedStationery, seedUsers, withSuperuser } from "../db/helpers";

// Roda em `pnpm test:db`. Mesmo padrão de tests/leads/repository.test.ts (chaves de `scripts/supa.mjs env`).
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
const DEMO_ENV = { DEMO_RETAILERS: "1", VERCEL_ENV: "development" };

let env: ReturnType<typeof localEnv>;
let admin: SupabaseClient;
const userIds: string[] = [];
const stationeryIds: string[] = [];
const roles = new Map<string, string>();

async function makeUser(label: string, role: "admin" | "stationery_member"): Promise<string> {
  const email = `billing-${label}-${RUN}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  userIds.push(id);
  roles.set(id, role);
  await withSuperuser((c) => c.query(`insert into public.profiles (id, role, display_name) values ($1, $2, $3) on conflict (id) do update set role = excluded.role`, [id, role, `Teste ${label}`]));
  return id;
}

async function actor(userId: string): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = roles.get(userId) ?? "parent";
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

async function newStationery(ownerId: string, isDemo: boolean): Promise<string> {
  const id = await withSuperuser((c) => seedStationery(c, { status: "active", ownerId, overrides: { is_demo: isDemo } }));
  stationeryIds.push(id);
  return id;
}

const DRAFT: PlanDraft = {
  freeLeads: 0,
  freeLeadsValidityDays: null,
  season: { startMonth: 11, endMonth: 3 },
  tiers: [{ minItems: 1, maxItems: null, priceCents: 900 }],
  packages: [{ amountCents: 5000 }],
  pass: null,
};

function service(): BillingService {
  return new BillingService({ store: createBillingStore(admin), providerFor: (wallet) => resolvePaymentProvider(DEMO_ENV, wallet), now: () => new Date() });
}

beforeAll(async () => {
  env = localEnv();
  admin = createClient(env.url, env.secret, opts);
  await seedUsers();
});

afterAll(async () => {
  await purgeLeads({ requesterIds: [IDS.parent] });
  await purgeStationeries(stationeryIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await cleanupUsers();
  await ensureTestBillingPlan({ force: true });
});

describe("BillingService × banco real (fim a fim)", () => {
  it("admin publica -> membro compra pacote demo -> simula pagamento -> lead debita -> extrato -> estorno -> saldo volta", async () => {
    const adminId = await makeUser("admin", "admin");
    const ownerId = await makeUser("owner", "stationery_member");
    const stationeryId = await newStationery(ownerId, true);
    const svc = service();

    const adminActor = await actor(adminId);
    await svc.publishPlan(adminActor, DRAFT);

    const plan = await svc.getActivePlan();
    expect(plan).not.toBeNull();
    const packageId = plan!.packages[0]!.id;

    const memberActor = await actor(ownerId);
    const purchase = await svc.buyPackage(memberActor, { stationeryId, packageId, idempotencyKey: randomUUID(), termsAccepted: true });
    expect(purchase.provider).toBe("demo");
    expect(purchase.pixCopyPaste).toBeNull();

    const simulated = await svc.simulateDemoPayment(memberActor, { stationeryId, invoiceId: purchase.invoiceId });
    expect(simulated).toBe(true);

    const afterTopup = await svc.getSummary(memberActor, stationeryId);
    expect(afterTopup).toMatchObject({ available: true, balanceCents: 5000 });

    // "entrega" do lead: inserção direta (mesmo caminho testado pela Task 1) — o gatilho debita a faixa (900).
    const lead = await withSuperuser((c) => seedLead(c, { stationeryId, requesterId: IDS.parent, overrides: { item_count: 2, school_name: "Escola Demonstração" } }));

    const afterDebit = await svc.getSummary(memberActor, stationeryId);
    expect(afterDebit).toMatchObject({ available: true, balanceCents: 4100 });

    const statement = await svc.getStatement(memberActor, stationeryId);
    expect(statement.lines.map((l) => l.description)).toEqual(["Recarga", `Lead ${lead.code} · Escola Demonstração`]);
    expect(statement.lines[1]!.balanceAfterCents).toBe(4100);
    // invariante: saldo = soma do razão = balance_after do último lançamento.
    const sum = statement.raw.reduce((s, e) => s + e.amountCents, 0);
    expect(sum).toBe(4100);
    expect(statement.raw.at(-1)!.balanceAfterCents).toBe(4100);

    const debitEntry = statement.raw.find((e) => e.entryType === "lead_debit");
    expect(debitEntry).toBeDefined();
    await svc.reverseEntry({ entryId: debitEntry!.id, actorId: adminId, actorRole: "admin", reason: "teste de repositório" });

    const afterReversal = await svc.getSummary(memberActor, stationeryId);
    expect(afterReversal).toMatchObject({ available: true, balanceCents: 5000 });

    // membro de OUTRA papelaria não lê nada desta.
    const otherOwner = await makeUser("otherOwner", "stationery_member");
    await newStationery(otherOwner, true);
    const otherActor = await actor(otherOwner);
    await expect(svc.getSummary(otherActor, stationeryId)).rejects.toBeInstanceOf(BillingError);
    await expect(svc.getSummary(otherActor, stationeryId)).rejects.toMatchObject({ code: "forbidden" });
  });
});
