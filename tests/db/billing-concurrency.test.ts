import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activePlanId,
  assertLedgerInvariant,
  CHARGING_PLAN,
  confirmInvoice,
  createPackageInvoice,
  cuiabaToday,
  ensureTestBillingPlan,
  ensureWallet,
  leadCreate,
  ledgerOf,
  packageOf,
  plan,
  publishPlanOk,
  purchasePass,
  topUp,
} from "./billing-fixtures";
import { asServiceCommitted, cleanupUsers, IDS, purgeBilling, purgeLeads, purgeStationeries, seedCart, seedStationery, seedUsers, withSuperuser } from "./helpers";

// Aceite do PLAN: "o saldo é sempre igual à soma do livro-razão, com teste de concorrência". Cada chamada roda numa
// conexão service_role própria que CONFIRMA (asServiceCommitted), em Promise.allSettled; limpeza por purge* no fim.

const PRICE = 500; // faixa 1..20 do CHARGING_PLAN
const K = 4;

type Requester = { id: string; cart: string };

async function makeRequesters(n: number): Promise<Requester[]> {
  return withSuperuser(async (c) => {
    const out: Requester[] = [];
    for (let i = 0; i < n; i++) {
      const id = randomUUID();
      await c.query("insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)", [id, `conc-${id}@teste.invalid`]);
      await c.query("insert into public.profiles (id, role, display_name) values ($1, 'parent', 'Conc') on conflict (id) do update set role = 'parent'", [id]);
      const cart = await seedCart(c, id);
      out.push({ id, cart });
    }
    return out;
  });
}

describe("S21 · concorrência do razão (dados confirmados)", () => {
  const stationeries: string[] = [];
  const users: string[] = [];
  const carts: string[] = [];

  beforeAll(async () => {
    await seedUsers();
    await ensureTestBillingPlan();
  });
  afterAll(async () => {
    await purgeLeads({ requesterIds: users, cartIds: carts });
    await purgeBilling({ stationeryIds: stationeries });
    await purgeStationeries(stationeries);
    await withSuperuser((c) => c.query("delete from auth.users where id = any($1::uuid[])", [users]));
    await ensureTestBillingPlan({ force: true });
    await cleanupUsers();
  });

  it("(a) saldo para K leads, 3K criações paralelas -> exatamente K entregues, 2K billing_required, razão coerente", async () => {
    await asServiceCommitted((c) => publishPlanOk(c, CHARGING_PLAN));
    const st = await asServiceCommitted((c) => seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } }));
    stationeries.push(st);
    await asServiceCommitted(async (c) => {
      await ensureWallet(c, st);
      // pacote de 5000 = 10 leads; queremos exatamente K: publica plano só para este teste com pacote K*PRICE
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, packages: [{ amount_cents: K * PRICE }] }));
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
    });
    const reqs = await makeRequesters(3 * K);
    users.push(...reqs.map((r) => r.id));
    carts.push(...reqs.map((r) => r.cart));
    const results = await Promise.allSettled(
      reqs.map((r) => asServiceCommitted((c) => leadCreate(c, { requester: r.id, cart: r.cart, stationery: st, itemCount: 3 }))),
    );
    const outcomes = results.map((r) => (r.status === "fulfilled" ? (r.value.error ? r.value.hint : "ok") : `rejected:${String(r.reason)}`));
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(K);
    expect(outcomes.filter((o) => o === "billing_required")).toHaveLength(2 * K);
    await withSuperuser(async (c) => {
      const n = (await c.query("select count(*)::int as n from public.leads where stationery_id = $1", [st])).rows[0].n;
      expect(n).toBe(K);
      const rows = await ledgerOf(c, st);
      expect(rows.map((r) => r.entry_type)).toEqual(["topup", ...Array.from({ length: K }, () => "lead_debit")]);
      expect(Number(rows[rows.length - 1]!.balance_after_cents)).toBe(0);
      expect(rows.every((r) => Number(r.balance_after_cents) >= 0)).toBe(true);
      await assertLedgerInvariant(c, st);
      // nenhum resto de transação desfeita: itens/eventos/notificações só dos K leads
      const events = (await c.query("select count(*)::int as n from public.lead_events e join public.leads l on l.id = e.lead_id where l.stationery_id = $1 and e.event_type = 'created'", [st])).rows[0].n;
      expect(events).toBe(K);
    });
  });

  it("(b) mesma fatura confirmada 5x em paralelo -> 1 topup; (c) estorno paralelo -> 1 reversal", async () => {
    const st = await asServiceCommitted((c) => seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } }));
    stationeries.push(st);
    const inv = await asServiceCommitted(async (c) => {
      const pkg = await packageOf(c, await activePlanId(c));
      const r = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg });
      if (r.error) throw new Error(r.error);
      return r.rows[0].id as string;
    });
    const amount = await withSuperuser(async (c) => Number((await c.query("select amount_cents from public.invoices where id = $1", [inv])).rows[0].amount_cents));
    const confirms = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => asServiceCommitted((c) => confirmInvoice(c, { invoice: inv, amount, ref: `par-${i}` }))),
    );
    const oks = confirms.map((r) => (r.status === "fulfilled" && !r.value.error ? r.value.rows[0].ok : `err:${r.status === "fulfilled" ? r.value.error : String(r.reason)}`));
    expect(oks.filter((o) => o === true)).toHaveLength(1);
    expect(oks.filter((o) => o === false)).toHaveLength(4);
    const debit = await asServiceCommitted(async (c) => {
      const [req] = await makeRequesters(1);
      users.push(req!.id);
      carts.push(req!.cart);
      const r = await leadCreate(c, { requester: req!.id, cart: req!.cart, stationery: st, itemCount: 2 });
      if (r.error) throw new Error(`${r.error} ${r.hint}`);
      return (await ledgerOf(c, st)).find((e) => e.entry_type === "lead_debit")!.id;
    });
    const reversals = await Promise.allSettled(
      Array.from({ length: 5 }, () => asServiceCommitted((c) => c.query("select public.billing_reverse_entry($1::uuid, null, 'system', 'paralelo') as id", [debit]))),
    );
    const ids = new Set(reversals.map((r) => (r.status === "fulfilled" ? (r.value.rows[0].id as string) : `err:${String(r.reason)}`)));
    expect(ids.size).toBe(1);
    await withSuperuser(async (c) => {
      const rows = await ledgerOf(c, st);
      expect(rows.filter((r) => r.entry_type === "topup")).toHaveLength(1);
      expect(rows.filter((r) => r.entry_type === "reversal")).toHaveLength(1);
      expect(Number(rows[rows.length - 1]!.balance_after_cents)).toBe(amount);
      await assertLedgerInvariant(c, st);
    });
  });

  it("(d) confirmações de faturas diferentes + débitos simultâneos na mesma carteira -> soma exata, sem deadlock", async () => {
    const st = await asServiceCommitted((c) => seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } }));
    stationeries.push(st);
    const invoices = await asServiceCommitted(async (c) => {
      const planId = await activePlanId(c);
      const pkg = await packageOf(c, planId);
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg }); // saldo inicial para os débitos
      const out: { id: string; amount: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await createPackageInvoice(c, { actor: IDS.stationery_member, stationery: st, pkg });
        if (r.error) throw new Error(r.error);
        out.push({ id: r.rows[0].id as string, amount: K * PRICE });
      }
      return out;
    });
    const reqs = await makeRequesters(3);
    users.push(...reqs.map((r) => r.id));
    carts.push(...reqs.map((r) => r.cart));
    const started = Date.now();
    const all = await Promise.allSettled([
      ...invoices.map((i) => asServiceCommitted((c) => confirmInvoice(c, { invoice: i.id, amount: i.amount }))),
      ...reqs.map((r) => asServiceCommitted((c) => leadCreate(c, { requester: r.id, cart: r.cart, stationery: st, itemCount: 2 }))),
    ]);
    expect(Date.now() - started).toBeLessThan(20_000);
    for (const r of all) {
      expect(r.status).toBe("fulfilled");
      if (r.status === "fulfilled") expect(r.value.error).toBeNull();
    }
    await withSuperuser(async (c) => {
      const rows = await ledgerOf(c, st);
      const expected = K * PRICE + 3 * K * PRICE - 3 * PRICE;
      expect(Number(rows[rows.length - 1]!.balance_after_cents)).toBe(expected);
      await assertLedgerInvariant(c, st);
    });
  });

  it("(e) compra de passe paralela com a mesma chave e com chaves diferentes -> 1 passe", async () => {
    const today = await withSuperuser(cuiabaToday);
    await asServiceCommitted((c) => publishPlanOk(c, plan({ ...CHARGING_PLAN, season: { start_month: today.month, end_month: ((today.month + 2) % 12) + 1 } })));
    const st = await asServiceCommitted((c) => seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } }));
    stationeries.push(st);
    const key = randomUUID();
    const runs = await Promise.allSettled([
      ...Array.from({ length: 3 }, () => asServiceCommitted((c) => purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 2, key }))),
      ...Array.from({ length: 3 }, () => asServiceCommitted((c) => purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 3 }))),
    ]);
    const ids = new Set(runs.map((r) => (r.status === "fulfilled" ? (r.value.error ? `err:${r.value.hint}` : (r.value.rows[0].id as string)) : `rej:${String(r.reason)}`)));
    expect(ids.size).toBe(1);
    await withSuperuser(async (c) => {
      const n = (await c.query("select count(*)::int as n from public.season_passes where stationery_id = $1", [st])).rows[0].n;
      expect(n).toBe(1);
    });
  });
});
