import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activePlanId,
  assertLedgerInvariant,
  CHARGING_PLAN,
  confirmInvoice,
  createPackageInvoice,
  cuiabaToday,
  ensureTestBillingPlan,
  ledgerOf,
  packageOf,
  plan,
  publishPlanOk,
  purchasePass,
} from "./billing-fixtures";
import { attemptH, cleanupUsers, IDS, seedStationery, seedUsers, withClaims, withSuperuser } from "./helpers";

async function window(c: Client, planId: string, at: string) {
  const r = await c.query("select season_start::text as s, season_end::text as e, starts_at, ends_at, in_season from public.billing_season_window($1::uuid, $2::timestamptz)", [planId, at]);
  return r.rows[0] as { s: string; e: string; starts_at: Date; ends_at: Date; in_season: boolean };
}

describe("S21 · temporada, passe, parcelas, faturas e consentimento", () => {
  beforeAll(async () => {
    await seedUsers();
    await ensureTestBillingPlan();
  });
  afterAll(cleanupUsers);

  it("billing_season_window em America/Cuiaba: nov-mar, virada de ano, último instante e primeiro instante fora, meses iguais", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local role service_role");
        const p = await publishPlanOk(c, plan({ season: { start_month: 11, end_month: 3 } }));
        await c.query("reset role");
        // Cuiabá = UTC-4 (sem horário de verão)
        expect(await window(c, p, "2026-12-15T12:00:00Z")).toMatchObject({ s: "2026-11-01", e: "2027-03-31", in_season: true });
        expect(await window(c, p, "2027-01-10T03:59:59Z")).toMatchObject({ s: "2026-11-01", e: "2027-03-31", in_season: true }); // 09/01 23:59 local
        expect(await window(c, p, "2027-04-01T03:59:59Z")).toMatchObject({ s: "2026-11-01", e: "2027-03-31", in_season: true }); // 31/03 23:59:59 local
        expect(await window(c, p, "2027-04-01T04:00:00Z")).toMatchObject({ s: "2027-11-01", e: "2028-03-31", in_season: false }); // 01/04 00:00 local
        expect(await window(c, p, "2026-10-31T12:00:00Z")).toMatchObject({ s: "2026-11-01", e: "2027-03-31", in_season: false });
        expect(await window(c, p, "2026-11-01T04:00:00Z")).toMatchObject({ s: "2026-11-01", e: "2027-03-31", in_season: true });
        expect(await window(c, p, "2026-11-01T03:59:59Z")).toMatchObject({ s: "2026-11-01", e: "2027-03-31", in_season: false });
        const w = await window(c, p, "2026-12-15T12:00:00Z");
        expect(w.starts_at.toISOString()).toBe("2026-11-01T04:00:00.000Z");
        expect(w.ends_at.toISOString()).toBe("2027-04-01T04:00:00.000Z");
        await c.query("set local role service_role");
        const same = await publishPlanOk(c, plan({ season: { start_month: 2, end_month: 2 } }));
        await c.query("reset role");
        expect(await window(c, same, "2028-02-29T12:00:00Z")).toMatchObject({ s: "2028-02-01", e: "2028-02-29", in_season: true });
        expect(await window(c, same, "2028-03-01T12:00:00Z")).toMatchObject({ s: "2029-02-01", e: "2029-02-28", in_season: false });
        await c.query("set local role service_role");
        const inYear = await publishPlanOk(c, plan({ season: { start_month: 2, end_month: 6 } }));
        await c.query("reset role");
        expect(await window(c, inYear, "2027-01-05T12:00:00Z")).toMatchObject({ s: "2027-02-01", e: "2027-06-30", in_season: false });
        expect(await window(c, inYear, "2027-07-05T12:00:00Z")).toMatchObject({ s: "2028-02-01", e: "2028-06-30", in_season: false });
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("compra do passe: pending_payment, parcelas com resto na 1ª e vencimentos mensais até o fim da temporada; ativa na 1ª parcela paga", async () => {
    await withClaims("system", async (c) => {
      const today = await cuiabaToday(c);
      // temporada corrente: do mês atual até 3 meses adiante (cabe 3x)
      const end = ((today.month + 2) % 12) + 1;
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, season: { start_month: today.month, end_month: end }, pass: { price_cents: 10001, included_leads: 10, max_installments: 3 } }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const r = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 3 });
      expect(r.error).toBeNull();
      const passId = r.rows[0]!.id as string;
      const pass = (await c.query("select status, price_cents, included_leads, installments, season_start::text as s, is_demo from public.season_passes where id = $1", [passId])).rows[0];
      expect(pass).toMatchObject({ status: "pending_payment", price_cents: 10001, included_leads: 10, installments: 3, is_demo: true });
      expect(pass.s).toBe(`${today.year}-${String(today.month).padStart(2, "0")}-01`);
      const inv = (await c.query("select id, installment_no, amount_cents, due_date::text as due, status, kind, provider from public.invoices where season_pass_id = $1 order by installment_no", [passId])).rows;
      expect(inv.map((i) => [i.installment_no, i.amount_cents, i.status, i.kind, i.provider])).toEqual([
        [1, 3335, "open", "season_pass_installment", "fake"],
        [2, 3333, "open", "season_pass_installment", "fake"],
        [3, 3333, "open", "season_pass_installment", "fake"],
      ]);
      const expectedDue = (await c.query("select (($1::date + (n || ' months')::interval))::date::text as d from generate_series(0, 2) n", [today.date])).rows.map((x) => x.d);
      expect(inv.map((i) => i.due)).toEqual(expectedDue);
      // repetir com a mesma chave ou outra chave devolve o mesmo passe pendente
      const again = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 2 });
      expect(again.rows[0]!.id).toBe(passId);
      expect((await c.query("select count(*)::int as n from public.invoices where season_pass_id = $1", [passId])).rows[0]!.n).toBe(3);
      // pagar a 1ª ativa; a 2ª não muda
      const ok = await confirmInvoice(c, { invoice: inv[0]!.id, amount: 3335 });
      expect(ok.rows[0]!.ok).toBe(true);
      expect((await c.query("select status, activated_at from public.season_passes where id = $1", [passId])).rows[0]).toMatchObject({ status: "active" });
      const dup = await confirmInvoice(c, { invoice: inv[0]!.id, amount: 3335 });
      expect(dup.rows[0]!.ok).toBe(false);
      await confirmInvoice(c, { invoice: inv[1]!.id, amount: 3333 });
      expect((await c.query("select count(*)::int as n from public.invoices where season_pass_id = $1 and status = 'paid'", [passId])).rows[0]!.n).toBe(2);
      // passe não gera lançamento no razão (só leads do passe geram pass_lead)
      expect(await ledgerOf(c, st)).toHaveLength(0);
      const s = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0]!.s as { active_pass: { id: string; leads_left: number; included_leads: number } | null };
      expect(s.active_pass).toMatchObject({ id: passId, leads_left: 10, included_leads: 10 });
    });
  });

  it("parcelas que passam do fim da temporada -> installments_unavailable; n acima do máximo -> invalid_input; plano sem passe -> billing_unavailable", async () => {
    await withClaims("system", async (c) => {
      const today = await cuiabaToday(c);
      // temporada corrente terminando neste mês: só 1x cabe
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, season: { start_month: today.month, end_month: today.month }, pass: { price_cents: 3000, included_leads: 3, max_installments: 3 } }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const three = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 3 });
      expect(three.hint).toBe("installments_unavailable");
      const two = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 2 });
      expect(two.hint).toBe("installments_unavailable");
      const four = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 4 });
      expect(four.hint).toBe("invalid_input");
      const zero = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 0 });
      expect(zero.hint).toBe("invalid_input");
      const one = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 1 });
      expect(one.error).toBeNull();
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, pass: null }));
      const st2 = await seedStationery(c, { status: "active", ownerId: IDS.school_member, overrides: { is_demo: true } });
      const none = await purchasePass(c, { actor: IDS.school_member, stationery: st2, installments: 1 });
      expect(none.hint).toBe("billing_unavailable");
    });
  });

  it("fora da temporada compra a próxima (preço cheio), com vencimentos a partir de hoje", async () => {
    await withClaims("system", async (c) => {
      const today = await cuiabaToday(c);
      // temporada que começa daqui a 2 meses e dura 4 meses
      const start = ((today.month + 1) % 12) + 1;
      const end = ((start + 2) % 12) + 1;
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, season: { start_month: start, end_month: end }, pass: { price_cents: 9000, included_leads: 5, max_installments: 3 } }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const r = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 3 });
      expect(r.error).toBeNull();
      const pass = (await c.query("select price_cents, season_start::text as s from public.season_passes where id = $1", [r.rows[0]!.id])).rows[0];
      expect(pass.price_cents).toBe(9000);
      expect(pass.s.slice(5, 7)).toBe(String(start).padStart(2, "0"));
      const due = (await c.query("select due_date::text as d from public.invoices where season_pass_id = $1 order by installment_no", [r.rows[0]!.id])).rows.map((x) => x.d);
      expect(due[0]).toBe(today.date);
      // passe pendente para a próxima temporada não cobre leads de hoje
      const s = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0]!.s as { active_pass: unknown };
      expect(s.active_pass).toBeNull();
    });
  });

  it("acesso e provedores da compra: não membro -> forbidden; papelaria não active -> stationery_unavailable; provedor inválido; fake/demo só is_demo", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const pkg = await packageOf(c, await activePlanId(c));
      const demo = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const real = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
      const paused = await seedStationery(c, { status: "paused", ownerId: IDS.parent, overrides: { is_demo: true } });
      expect((await createPackageInvoice(c, { actor: IDS.parent, stationery: demo, pkg })).hint).toBe("forbidden");
      expect((await purchasePass(c, { actor: IDS.parent, stationery: demo })).hint).toBe("forbidden");
      expect((await createPackageInvoice(c, { actor: IDS.parent, stationery: paused, pkg })).hint).toBe("stationery_unavailable");
      expect((await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: demo, pkg, provider: "card" })).hint).toBe("provider_invalid");
      expect((await createPackageInvoice(c, { actor: IDS.school_member, stationery: real, pkg, provider: "fake" })).hint).toBe("provider_invalid");
      expect((await createPackageInvoice(c, { actor: IDS.school_member, stationery: real, pkg, provider: "demo" })).hint).toBe("provider_invalid");
      const pixReal = await createPackageInvoice(c, { actor: IDS.school_member, stationery: real, pkg, provider: "pix" });
      expect(pixReal.error).toBeNull();
      expect((await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: demo, pkg: randomUUID() })).hint).toBe("not_found");
      // pacote de plano arquivado
      await publishPlanOk(c, CHARGING_PLAN);
      expect((await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: demo, pkg })).hint).toBe("not_found");
      // JWT sub diferente do ator
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.parent })]);
      expect((await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: demo, pkg: await packageOf(c, await activePlanId(c)) })).hint).toBe("forbidden");
    });
  });

  it("fatura de pacote: idempotente pela chave, consentimento gravado na mesma transação (uma vez), sem aceite -> consent_required", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const pkg = await packageOf(c, await activePlanId(c));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const noTerms = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg, terms: null });
      expect(noTerms.hint).toBe("consent_required");
      const blank = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg, terms: "  " });
      expect(blank.hint).toBe("consent_required");
      const key = randomUUID();
      const a = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg, key, terms: "billing-2026-09" });
      const b = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg, key, terms: "billing-2026-09" });
      expect(a.error).toBeNull();
      expect(a.rows[0]!.id).toBe(b.rows[0]!.id);
      const consents = (await c.query("select text_version from public.consents where profile_id = $1 and purpose = 'billing_terms'", [IDS.stationery_member])).rows;
      expect(consents).toEqual([{ text_version: "billing-2026-09" }]);
      const inv = (await c.query("select kind, amount_cents, status, provider, due_date::text as due, consent_id, is_demo, package_id from public.invoices where id = $1", [a.rows[0]!.id])).rows[0];
      expect(inv).toMatchObject({ kind: "credit_package", amount_cents: 5000, status: "open", provider: "fake", is_demo: true, package_id: pkg });
      expect(inv.consent_id).not.toBeNull();
      // segunda compra sem reenviar o aceite: vale o consentimento anterior
      const c2 = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg, terms: null });
      expect(c2.error).toBeNull();
      expect((await c.query("select count(*)::int as n from public.consents where profile_id = $1 and purpose = 'billing_terms'", [IDS.stationery_member])).rows[0]!.n).toBe(1);
    });
  });

  it("confirmação: idempotente, amount_mismatch, provider_invalid, topup com balance_after certo; fake em carteira real recusado", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const pkg = await packageOf(c, await activePlanId(c));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const inv = (await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg })).rows[0]!.id as string;
      expect((await confirmInvoice(c, { invoice: inv, amount: 4999 })).hint).toBe("amount_mismatch");
      expect((await confirmInvoice(c, { invoice: inv, amount: 5000, provider: "pix" })).hint).toBe("provider_invalid");
      expect((await confirmInvoice(c, { invoice: randomUUID(), amount: 5000 })).hint).toBe("not_found");
      const first = await confirmInvoice(c, { invoice: inv, amount: 5000, ref: "fake-1" });
      expect(first.rows[0]!.ok).toBe(true);
      const again = await confirmInvoice(c, { invoice: inv, amount: 5000, ref: "fake-2" });
      expect(again.rows[0]!.ok).toBe(false);
      const rows = await ledgerOf(c, st);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ entry_type: "topup", amount_cents: 5000, invoice_id: inv });
      expect(Number(rows[0]!.balance_after_cents)).toBe(5000);
      const paid = (await c.query("select status, paid_amount_cents, paid_at, provider_charge_id from public.invoices where id = $1", [inv])).rows[0];
      expect(paid).toMatchObject({ status: "paid", paid_amount_cents: 5000 });
      expect(paid.paid_at).not.toBeNull();
      // 2ª fatura confirmada: balance_after acumula
      const inv2 = (await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c), 2) })).rows[0]!.id as string;
      await confirmInvoice(c, { invoice: inv2, amount: 10000 });
      expect(Number((await ledgerOf(c, st))[1]!.balance_after_cents)).toBe(15000);
      await assertLedgerInvariant(c, st);
      // carteira real: fatura pix; confirmar com 'fake' é provider_invalid
      const real = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
      const pinv = (await createPackageInvoice(c, { actor: IDS.school_member, stationery: real, pkg, provider: "pix" })).rows[0]!.id as string;
      expect((await confirmInvoice(c, { invoice: pinv, amount: 5000, provider: "fake" })).hint).toBe("provider_invalid");
      expect((await confirmInvoice(c, { invoice: pinv, amount: 5000, provider: "demo" })).hint).toBe("provider_invalid");
    });
  });

  it("billing_attach_charge grava txid/BR Code/validade só em fatura aberta do mesmo provedor; txid único por provedor", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const pkg = await packageOf(c, await activePlanId(c));
      const real = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
      const inv = (await createPackageInvoice(c, { actor: IDS.school_member, stationery: real, pkg, provider: "pix" })).rows[0]!.id as string;
      const inv2 = (await createPackageInvoice(c, { actor: IDS.school_member, stationery: real, pkg, provider: "pix" })).rows[0]!.id as string;
      const attach = (id: string, provider: string, txid: string) =>
        attemptH(c, "select public.billing_attach_charge($1::uuid, $2::text, $3::text, $4::text, now() + interval '1 hour')", [id, provider, txid, "00020126...BRCODE"]);
      expect((await attach(inv, "fake", "abc")).hint).toBe("provider_invalid");
      expect((await attach(inv, "pix", "txid0000000000000000000000001")).error).toBeNull();
      expect((await attach(inv2, "pix", "txid0000000000000000000000001")).code).toBe("23505");
      const row = (await c.query("select provider_charge_id, pix_copy_paste, charge_expires_at from public.invoices where id = $1", [inv])).rows[0];
      expect(row.provider_charge_id).toBe("txid0000000000000000000000001");
      expect(row.pix_copy_paste).toBe("00020126...BRCODE");
      // regenerar (vencida) troca o txid
      expect((await attach(inv, "pix", "txid0000000000000000000000002")).error).toBeNull();
      await confirmInvoice(c, { invoice: inv, amount: 5000, provider: "pix", ref: "txid0000000000000000000000002" });
      expect((await attach(inv, "pix", "txid0000000000000000000000003")).hint).toBe("invalid_state");
      expect((await attach(randomUUID(), "pix", "x")).hint).toBe("not_found");
    });
  });
});
