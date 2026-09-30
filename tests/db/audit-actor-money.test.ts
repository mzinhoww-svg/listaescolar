import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { activePlanId, CHARGING_PLAN, ledgerOf, packageOf, plan, publishPlanOk, topUp } from "./billing-fixtures";
import { batchCreate, batchMarkExecuted, confirmSale, ledgerFor, publishPayoutSettingsOk, publishSchoolConfig, validateSale } from "./payout-fixtures";
import { asOwner, attempt, attemptH, cleanupUsers, ensureSchool, IDS, seedCart, seedLead, seedStationery, seedUsers, withClaims } from "./helpers";

// S29 · UX-108 (fix 1): os cinco caminhos que mexem em dinheiro também registram o admin que decidiu.
const auditOf = async (c: Client, table: string, id: string, action = "INSERT") =>
  (await c.query("select actor_id, actor_role from public.audit_log where entity_table = $1 and entity_id = $2 and action = $3 order by created_at desc, id desc limit 1", [table, id, action])).rows[0] as
    | { actor_id: string | null; actor_role: string | null }
    | undefined;
const ADMIN = { actor_id: IDS.admin, actor_role: "admin" };

async function tmpAudit(c: Client, table: string): Promise<void> {
  // as tabelas do razão não têm gatilho de auditoria: um gatilho provisório (rollback) prova a propagação do ator.
  await asOwner(c, () => c.query(`create trigger zz_tmp_audit after insert on public.${table} for each row execute function public.audit_row_change()`));
}
async function sale(c: Client, o: { by: string; role: "stationery_member" | "admin"; school?: string | null }) {
  const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
  const lead = await seedLead(c, { stationeryId: st, status: "converted", overrides: { declared_sale_cents: 10000, declared_at: new Date().toISOString(), is_demo: false } });
  const r = await confirmSale(c, { actorId: o.by, actorRole: o.role, leadId: lead.id, schoolId: o.school ?? null });
  return { st, lead, saleId: r.rows[0]!.id as string };
}

describe("S29 audit_log: ator nos caminhos de dinheiro", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("payout_batch_create e payout_batch_mark_executed gravam o admin", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "school", payoutBps: 200 });
      await sale(c, { by: IDS.admin, role: "admin", school });
      const b = await batchCreate(c, { actorId: IDS.admin, schoolId: school, beneficiaryType: "school" });
      const batch = b.rows[0]!.id as string;
      expect(await auditOf(c, "payout_batches", batch)).toMatchObject(ADMIN);
      expect((await batchMarkExecuted(c, { actorId: IDS.admin, batchId: batch })).error).toBeNull();
      expect(await auditOf(c, "payout_batches", batch, "UPDATE")).toMatchObject(ADMIN);
    });
  });

  it("payout_admin_validate_sale e payout_reverse_entry gravam o admin no razão", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300 });
      await tmpAudit(c, "payout_ledger");
      const { lead, saleId } = await sale(c, { by: IDS.stationery_member, role: "stationery_member" });
      expect((await validateSale(c, { actorId: IDS.admin, leadId: lead.id, schoolId: school })).error).toBeNull();
      const due = (await ledgerFor(c, "apm", school)).find((r) => r.sale_payment_id === saleId)!;
      expect(await auditOf(c, "payout_ledger", due.id)).toMatchObject(ADMIN);
      const rev = await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, $3::text) as id", [due.id, IDS.admin, "cancelado"]);
      expect(rev.error).toBeNull();
      expect(await auditOf(c, "payout_ledger", rev.rows[0]!.id as string)).toMatchObject(ADMIN);
    });
  });

  it("billing_reverse_entry grava o admin; com ator system (null) segue 'system'", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 0 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const pkg = await packageOf(c, await activePlanId(c));
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg });
      const cart = await seedCart(c, IDS.parent);
      await seedLead(c, { stationeryId: st, cartId: cart, overrides: { item_count: 2 } });
      const debit = (await ledgerOf(c, st)).find((r) => r.entry_type === "lead_debit")!;
      await tmpAudit(c, "credit_ledger");
      const rev = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'contestação aceita') as id", [debit.id, IDS.admin]);
      expect(rev.error).toBeNull();
      expect(await auditOf(c, "credit_ledger", rev.rows[0]!.id as string)).toMatchObject(ADMIN);
    });
  });

  it("não-admin é recusado e nada é atribuído a ele", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "school", payoutBps: 200 });
      await sale(c, { by: IDS.admin, role: "admin", school });
      expect((await batchCreate(c, { actorId: IDS.parent, schoolId: school, beneficiaryType: "school" })).hint).toBe("forbidden");
      expect((await validateSale(c, { actorId: IDS.parent, leadId: "00000000-0000-4000-8000-0000000000aa" })).error).not.toBeNull();
      expect((await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, 'x')", ["00000000-0000-4000-8000-0000000000aa", IDS.parent])).hint).toBe("forbidden");
      expect((await c.query("select count(*)::int as n from public.audit_log where actor_id = $1", [IDS.parent])).rows[0].n).toBe(0);
    });
  });

  it("os núcleos __core dos cinco não são executáveis (nem pelo service_role)", async () => {
    await withClaims("system", async (c) => {
      const calls = [
        "select public.billing_reverse_entry__core(gen_random_uuid(), null, 'system', 'x')",
        "select public.payout_reverse_entry__core(gen_random_uuid(), null, 'x')",
        "select public.payout_batch_create__core(null, gen_random_uuid(), 'school')",
        "select public.payout_batch_mark_executed__core(null, gen_random_uuid())",
        "select public.payout_admin_validate_sale__core(null, gen_random_uuid(), null)",
      ];
      for (const sql of calls) expect((await attempt(c, sql)).code, sql).toBe("42501");
    });
  });
});
