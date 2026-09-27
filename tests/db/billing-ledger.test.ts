import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activePlanId,
  assertLedgerInvariant,
  CHARGING_PLAN,
  createPackageInvoice,
  ensureTestBillingPlan,
  ensureWallet,
  ledgerOf,
  packageOf,
  plan,
  publishPlanOk,
  topUp,
  walletId,
} from "./billing-fixtures";
import { attempt, attemptH, cleanupUsers, IDS, seedCart, seedLead, seedStationery, seedUsers, withClaims, withSuperuser } from "./helpers";

describe("S21 · credit_ledger: sinais, imutabilidade, estorno e invariante", () => {
  beforeAll(async () => {
    await seedUsers();
    await ensureTestBillingPlan();
  });
  afterAll(cleanupUsers);

  it("CHECKs por entry_type: topup > 0, lead_debit < 0, free_lead/pass_lead = 0, reversal exige reverses_entry_id; balance_after >= 0", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local role service_role");
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
        await ensureWallet(c, st);
        await c.query("reset role");
        const w = await walletId(c, st);
        const ins = (type: string, amount: number, extra = "", extraVals: unknown[] = []) =>
          attempt(
            c,
            `insert into public.credit_ledger (wallet_id, entry_type, amount_cents, balance_after_cents, idempotency_key ${extra ? ", " + extra : ""})
             values ($1, $2, $3, greatest($3, 0), $4 ${extraVals.map((_, i) => `, $${i + 5}`).join("")})`,
            [w, type, amount, randomUUID(), ...extraVals],
          );
        expect((await ins("topup", 0)).code).toBe("23514");
        expect((await ins("topup", -5)).code).toBe("23514");
        expect((await ins("lead_debit", 5)).code).toBe("23514");
        expect((await ins("lead_debit", 0)).code).toBe("23514");
        expect((await ins("free_lead", 1)).code).toBe("23514");
        expect((await ins("pass_lead", -1)).code).toBe("23514");
        expect((await ins("reversal", 5)).code).toBe("23514"); // sem reverses_entry_id
        expect((await ins("bonus", 5)).code).toBe("23514");
        const neg = await attempt(c, "insert into public.credit_ledger (wallet_id, entry_type, amount_cents, balance_after_cents, idempotency_key) values ($1, 'lead_debit', -5, -5, $2)", [w, randomUUID()]);
        expect(neg.code).toBe("23514");
        const ok = await ins("topup", 5);
        expect(ok.error).toBeNull();
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("imutável: update/delete/truncate falham para service_role, dono e com replica; gatilhos enable always", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local role service_role");
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
        await ensureWallet(c, st);
        const pkg = await packageOf(c, await activePlanId(c));
        await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg });
        const entry = (await ledgerOf(c, st))[0]!;
        // service_role: sem grant
        expect((await attempt(c, "update public.credit_ledger set amount_cents = 1 where id = $1", [entry.id])).code).toBe("42501");
        expect((await attempt(c, "delete from public.credit_ledger where id = $1", [entry.id])).code).toBe("42501");
        // dono do banco: gatilho
        await c.query("reset role");
        expect((await attempt(c, "update public.credit_ledger set amount_cents = 1 where id = $1", [entry.id])).code).toBe("42501");
        expect((await attempt(c, "update public.credit_ledger set updated_at = now() where id = $1", [entry.id])).code).toBe("42501");
        expect((await attempt(c, "delete from public.credit_ledger where id = $1", [entry.id])).code).toBe("42501");
        expect((await attempt(c, "truncate public.credit_ledger")).code).toBe("42501");
        // replica (como usam as limpezas de teste): continua bloqueado
        await c.query("set local session_replication_role = replica");
        expect((await attempt(c, "delete from public.credit_ledger where id = $1", [entry.id])).code).toBe("42501");
        expect((await attempt(c, "update public.credit_ledger set reason = 'x' where id = $1", [entry.id])).code).toBe("42501");
        await c.query("set local session_replication_role = origin");
        const trg = (await c.query("select tgname, tgenabled from pg_trigger where tgrelid = 'public.credit_ledger'::regclass and not tgisinternal order by tgname")).rows;
        const names = trg.map((t) => t.tgname);
        expect(names).toEqual(expect.arrayContaining(["credit_ledger_no_update_delete", "credit_ledger_no_truncate"]));
        for (const t of trg) expect(t.tgenabled, t.tgname).toBe("A");
        // FK em cascata não apaga: carteira não pode ser apagada (restrict) e a papelaria também não
        expect((await attempt(c, "delete from public.stationery_wallets where stationery_id = $1", [st])).code).toBe("42501");
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("gatilho leads_billing_charge é enable always e dispara AFTER INSERT em leads", async () => {
    await withSuperuser(async (c) => {
      const t = (await c.query("select tgenabled, tgtype from pg_trigger where tgname = 'leads_billing_charge' and tgrelid = 'public.leads'::regclass")).rows[0];
      expect(t?.tgenabled).toBe("A");
      // tgtype: bit 0 = row, bit 1 = before (0 = after), bit 2 = insert
      expect(Number(t.tgtype) & 1).toBe(1);
      expect(Number(t.tgtype) & 2).toBe(0);
      expect(Number(t.tgtype) & 4).toBe(4);
    });
  });

  it("estorno: lançamento compensatório único, restaura cota de grátis, recusa estorno de estorno e de topup; idempotente", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 1 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const pkg = await packageOf(c, await activePlanId(c));
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg }); // +5000
      const cart = await seedCart(c, IDS.parent);
      const a = await seedLead(c, { stationeryId: st, cartId: cart, overrides: { item_count: 2 } }); // grátis
      const b = await seedLead(c, { stationeryId: st, cartId: cart, overrides: { item_count: 2 } }); // débito 500
      let rows = await ledgerOf(c, st);
      expect(rows.map((r) => r.entry_type)).toEqual(["topup", "free_lead", "lead_debit"]);
      const freeEntry = rows[1]!;
      const debitEntry = rows[2]!;
      expect(debitEntry.amount_cents).toBe(-500);
      expect(debitEntry.lead_id).toBe(b.id);
      expect(freeEntry.lead_id).toBe(a.id);

      const rev = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'contestação aceita') as id", [debitEntry.id, IDS.admin]);
      expect(rev.error).toBeNull();
      const rev2 = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'de novo') as id", [debitEntry.id, IDS.admin]);
      expect(rev2.rows[0]!.id).toBe(rev.rows[0]!.id);
      rows = await ledgerOf(c, st);
      expect(rows.filter((r) => r.entry_type === "reversal")).toHaveLength(1);
      const reversal = rows.find((r) => r.entry_type === "reversal")!;
      expect(reversal.amount_cents).toBe(500);
      expect(reversal.reverses_entry_id).toBe(debitEntry.id);
      expect(Number(reversal.balance_after_cents)).toBe(5000);
      // estorno de estorno
      const rr = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'x')", [reversal.id, IDS.admin]);
      expect(rr.hint).toBe("invalid_input");
      // topup não se estorna por aqui
      const tu = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'x')", [rows[0]!.id, IDS.admin]);
      expect(tu.hint).toBe("invalid_input");
      // não admin
      const na = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'x')", [freeEntry.id, IDS.parent]);
      expect(na.hint).toBe("forbidden");
      const badRole = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'parent', 'x')", [freeEntry.id, IDS.parent]);
      expect(badRole.hint).toBe("invalid_input");
      const nf = await attemptH(c, "select public.billing_reverse_entry($1::uuid, $2::uuid, 'admin', 'x')", [randomUUID(), IDS.admin]);
      expect(nf.hint).toBe("not_found");
      // estornar o grátis devolve a cota: próximo lead volta a ser grátis
      const rf = await attemptH(c, "select public.billing_reverse_entry($1::uuid, null, 'system', 'contestação') as id", [freeEntry.id]);
      expect(rf.error).toBeNull();
      const s = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0]!.s as Record<string, unknown>;
      expect(s.free_left).toBe(1);
      await seedLead(c, { stationeryId: st, cartId: cart, overrides: { item_count: 2 } });
      rows = await ledgerOf(c, st);
      expect(rows[rows.length - 1]!.entry_type).toBe("free_lead");
      await assertLedgerInvariant(c, st);
    });
  });

  it("invariante: soma = último balance_after depois de recargas, débitos e estornos misturados", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const planId = await activePlanId(c);
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, planId, 1) });
      const cart = await seedCart(c, IDS.parent);
      for (let i = 0; i < 4; i++) await seedLead(c, { stationeryId: st, cartId: cart, requesterId: IDS.parent, overrides: { item_count: i % 2 ? 2 : 30 } });
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, planId, 2) });
      const rows = await ledgerOf(c, st);
      await c.query("select public.billing_reverse_entry($1::uuid, null, 'system', 'x')", [rows[2]!.id]);
      await assertLedgerInvariant(c, st);
      const balance = Number((await c.query("select public.billing_wallet_summary($1::uuid) ->> 'balance_cents' as b", [st])).rows[0]!.b);
      // débitos na ordem dos leads (item_count 30,2,30,2 -> tiers 900,500,900,500); rows[2] é o 2º débito (-500):
      // reembolsa +500, não +900 (a fórmula anterior presumia a ordem errada dos débitos).
      expect(balance).toBe(5000 - 900 - 500 - 900 - 500 + 10000 + 500);
    });
  });

  it("membro lê só a própria carteira/razão; sem actor_id nem idempotency_key; outro membro e parent nada; admin por authenticated nada", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const mine = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const other = await seedStationery(c, { status: "active", ownerId: IDS.school_member, overrides: { is_demo: true } });
      const pkg = await packageOf(c, await activePlanId(c));
      await topUp(c, { actor: IDS.stationery_member, stationery: mine, pkg });
      await topUp(c, { actor: IDS.school_member, stationery: other, pkg });
      const inv = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: mine, pkg });
      expect(inv.error).toBeNull();
      const as = async (sub: string, role = "authenticated") => {
        await c.query(`set local role ${role}`);
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role, sub })]);
      };
      await as(IDS.stationery_member);
      const w = (await c.query("select stationery_id from public.stationery_wallets")).rows;
      expect(w).toEqual([{ stationery_id: mine }]);
      const l = (await c.query("select id, entry_type, amount_cents, balance_after_cents from public.credit_ledger")).rows;
      expect(l).toHaveLength(1);
      expect((await attempt(c, "select actor_id from public.credit_ledger")).code).toBe("42501");
      expect((await attempt(c, "select idempotency_key from public.credit_ledger")).code).toBe("42501");
      expect((await attempt(c, "select idempotency_key from public.invoices")).code).toBe("42501");
      expect((await attempt(c, "select consent_id from public.invoices")).code).toBe("42501");
      expect((await attempt(c, "select provider_charge_id from public.invoices")).code).toBe("42501");
      expect((await attempt(c, "select idempotency_key from public.season_passes")).code).toBe("42501");
      const invs = (await c.query("select stationery_id, status, amount_cents, pix_copy_paste from public.invoices")).rows;
      expect(invs.every((r) => r.stationery_id === mine)).toBe(true);
      expect(invs).toHaveLength(2);
      await c.query("reset role");
      await as(IDS.parent);
      expect((await c.query("select id from public.stationery_wallets")).rows).toHaveLength(0);
      expect((await c.query("select id from public.credit_ledger")).rows).toHaveLength(0);
      expect((await c.query("select id from public.invoices")).rows).toHaveLength(0);
      await c.query("reset role");
      await as(IDS.admin);
      expect((await c.query("select id from public.stationery_wallets")).rows).toHaveLength(0);
      expect((await c.query("select id from public.credit_ledger")).rows).toHaveLength(0);
      await c.query("reset role");
      await as(IDS.stationery_member, "service_role");
      expect((await c.query("select id from public.stationery_wallets")).rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});
