import { randomUUID } from "node:crypto";
import type { Client } from "pg";

import { attemptH, IDS, withSuperuser, type HintAttempt } from "./helpers";

// Fixtures da cobrança (S21). Tudo passa pelas funções SQL da 0401 (service_role) ou por inserção superuser quando o
// teste precisa de um estado que a função não produz (ex.: plano de teste padrão sem depender de perfis).

export type PlanInput = {
  free_leads: number;
  free_leads_validity_days: number | null;
  tiers: { min_items: number; max_items: number | null; price_cents: number }[];
  packages: { amount_cents: number }[];
  season: { start_month: number; end_month: number };
  pass: { price_cents: number; included_leads: number; max_installments: number } | null;
};

/** Plano de teste padrão (não comercial): grátis à vontade, uma faixa aberta barata, um pacote, sem passe. */
export const DEFAULT_TEST_PLAN: PlanInput = {
  free_leads: 10000,
  free_leads_validity_days: null,
  tiers: [{ min_items: 1, max_items: null, price_cents: 100 }],
  packages: [{ amount_cents: 1000 }],
  season: { start_month: 11, end_month: 3 },
  pass: null,
};

/** Plano de cobrança "real" dos testes: sem grátis, duas faixas, dois pacotes e passe em 3x. */
export const CHARGING_PLAN: PlanInput = {
  free_leads: 0,
  free_leads_validity_days: null,
  tiers: [
    { min_items: 1, max_items: 20, price_cents: 500 },
    { min_items: 21, max_items: null, price_cents: 900 },
  ],
  packages: [{ amount_cents: 5000 }, { amount_cents: 10000 }],
  season: { start_month: 11, end_month: 3 },
  pass: { price_cents: 30000, included_leads: 40, max_installments: 3 },
};

export function plan(over: Partial<PlanInput> = {}): PlanInput {
  return { ...DEFAULT_TEST_PLAN, ...over };
}

/** `billing_plan_publish` como service_role (a transação já tem `set local role service_role`), em nome do admin. */
export async function publishPlan(c: Client, input: PlanInput, actorId: string = IDS.admin): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_plan_publish($1::uuid, $2::jsonb) as id", [actorId, JSON.stringify(input)]);
}

export async function publishPlanOk(c: Client, input: PlanInput, actorId: string = IDS.admin): Promise<string> {
  const r = await publishPlan(c, input, actorId);
  if (r.error) throw new Error(`publishPlan: ${r.error} (${r.hint})`);
  return r.rows[0]!.id as string;
}

/**
 * Garante um plano ativo (o de teste padrão) por inserção direta como superuser: os testes de outras fatias criam leads e o
 * gatilho de cobrança exige plano ativo. Idempotente. `force` publica uma versão nova mesmo havendo plano ativo.
 */
export async function ensureTestBillingPlan(opts: { force?: boolean } = {}): Promise<void> {
  await withSuperuser(async (c) => {
    const has = await c.query("select 1 from public.plans where status = 'active'");
    if (has.rowCount && !opts.force) return;
    await c.query("begin");
    try {
      await c.query("update public.plans set status = 'archived' where status = 'active'");
      const p = DEFAULT_TEST_PLAN;
      const inserted = await c.query(
        `insert into public.plans (version, status, free_leads, free_leads_validity_days, pass_price_cents, pass_included_leads,
                                   pass_max_installments, season_start_month, season_end_month, published_by)
         values ((select coalesce(max(version), 0) + 1 from public.plans), 'active', $1, $2, null, null, null, $3, $4, null)
         returning id`,
        [p.free_leads, p.free_leads_validity_days, p.season.start_month, p.season.end_month],
      );
      const id = inserted.rows[0].id as string;
      for (const [i, t] of p.tiers.entries()) {
        await c.query("insert into public.plan_price_tiers (plan_id, position, min_items, max_items, price_cents) values ($1, $2, $3, $4, $5)", [
          id,
          i + 1,
          t.min_items,
          t.max_items,
          t.price_cents,
        ]);
      }
      for (const [i, k] of p.packages.entries()) {
        await c.query("insert into public.plan_credit_packages (plan_id, position, amount_cents) values ($1, $2, $3)", [id, i + 1, k.amount_cents]);
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
}

export type LedgerRow = {
  id: string;
  entry_type: string;
  amount_cents: number;
  balance_after_cents: string | number;
  lead_id: string | null;
  invoice_id: string | null;
  tier_id: string | null;
  season_pass_id: string | null;
  reverses_entry_id: string | null;
  item_count: number | null;
  created_at: Date;
};

export async function walletId(c: Client, stationeryId: string): Promise<string | null> {
  const r = await c.query("select id from public.stationery_wallets where stationery_id = $1", [stationeryId]);
  return (r.rows[0]?.id as string | undefined) ?? null;
}

export async function ledgerOf(c: Client, stationeryId: string): Promise<LedgerRow[]> {
  const r = await c.query(
    `select e.id, e.entry_type, e.amount_cents, e.balance_after_cents, e.lead_id, e.invoice_id, e.tier_id, e.season_pass_id,
            e.reverses_entry_id, e.item_count, e.created_at
       from public.credit_ledger e join public.stationery_wallets w on w.id = e.wallet_id
      where w.stationery_id = $1 order by e.created_at, e.id`,
    [stationeryId],
  );
  return r.rows as LedgerRow[];
}

export async function balanceOf(c: Client, stationeryId: string): Promise<number> {
  const r = await c.query(
    `select coalesce(sum(e.amount_cents), 0)::bigint as b from public.credit_ledger e
       join public.stationery_wallets w on w.id = e.wallet_id where w.stationery_id = $1`,
    [stationeryId],
  );
  return Number(r.rows[0].b);
}

/** Invariante do razão: soma dos lançamentos = balance_after do último; nenhum balance_after negativo; sequência coerente. */
export async function assertLedgerInvariant(c: Client, stationeryId: string): Promise<void> {
  const rows = await ledgerOf(c, stationeryId);
  let running = 0;
  for (const row of rows) {
    running += row.amount_cents;
    if (Number(row.balance_after_cents) !== running) {
      throw new Error(`balance_after_cents ${row.balance_after_cents} ≠ soma acumulada ${running} em ${row.id} (${row.entry_type})`);
    }
    if (running < 0) throw new Error(`saldo negativo (${running}) em ${row.id}`);
  }
  const sum = await balanceOf(c, stationeryId);
  const last = rows.length ? Number(rows[rows.length - 1]!.balance_after_cents) : 0;
  if (sum !== last) throw new Error(`soma ${sum} ≠ último balance_after ${last}`);
}

/** Papelaria + carteira (billing_ensure_wallet). */
export async function ensureWallet(c: Client, stationeryId: string): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_ensure_wallet($1::uuid) as id", [stationeryId]);
}

export async function activePlanId(c: Client): Promise<string> {
  const r = await c.query("select id from public.plans where status = 'active'");
  return r.rows[0].id as string;
}

export async function packageOf(c: Client, planId: string, position = 1): Promise<string> {
  const r = await c.query("select id from public.plan_credit_packages where plan_id = $1 and position = $2", [planId, position]);
  return r.rows[0].id as string;
}

export async function createPackageInvoice(
  c: Client,
  o: { actor: string; stationery: string; pkg: string; provider?: string; key?: string; terms?: string | null },
): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_create_package_invoice($1::uuid, $2::uuid, $3::uuid, $4::text, $5::uuid, $6::text) as id", [
    o.actor,
    o.stationery,
    o.pkg,
    o.provider ?? "fake",
    o.key ?? randomUUID(),
    o.terms === undefined ? "billing-test-v1" : o.terms,
  ]);
}

export async function confirmInvoice(
  c: Client,
  o: { invoice: string; provider?: string; ref?: string; amount: number; paidAt?: string },
): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_confirm_invoice_payment($1::uuid, $2::text, $3::text, $4::int, $5::timestamptz) as ok", [
    o.invoice,
    o.provider ?? "fake",
    o.ref ?? `fake-${randomUUID()}`,
    o.amount,
    o.paidAt ?? new Date().toISOString(),
  ]);
}

export async function purchasePass(
  c: Client,
  o: { actor: string; stationery: string; installments?: number; provider?: string; key?: string; terms?: string | null },
): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_purchase_season_pass($1::uuid, $2::uuid, $3::int, $4::text, $5::uuid, $6::text) as id", [
    o.actor,
    o.stationery,
    o.installments ?? 1,
    o.provider ?? "fake",
    o.key ?? randomUUID(),
    o.terms === undefined ? "billing-test-v1" : o.terms,
  ]);
}

/** Recarrega a carteira: fatura de pacote + confirmação (carteira demo, provedor fake). Devolve o valor creditado. */
export async function topUp(c: Client, o: { actor: string; stationery: string; pkg: string }): Promise<number> {
  const inv = await createPackageInvoice(c, o);
  if (inv.error) throw new Error(`fatura: ${inv.error} (${inv.hint})`);
  const invoiceId = inv.rows[0]!.id as string;
  const amount = Number((await c.query("select amount_cents from public.invoices where id = $1", [invoiceId])).rows[0].amount_cents);
  const ok = await confirmInvoice(c, { invoice: invoiceId, amount });
  if (ok.error) throw new Error(`confirmar: ${ok.error} (${ok.hint})`);
  return amount;
}

/** Mês corrente em America/Cuiaba (1..12) e data local, para escolher meses de temporada em relação a hoje. */
export async function cuiabaToday(c: Client): Promise<{ month: number; year: number; day: number; date: string }> {
  const r = await c.query(
    `select extract(month from d)::int as month, extract(year from d)::int as year, extract(day from d)::int as day, d::text as date
       from (select (now() at time zone 'America/Cuiaba')::date as d) t`,
  );
  return r.rows[0] as { month: number; year: number; day: number; date: string };
}

const LEAD_CREATE = `select * from public.lead_create($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::int, $8::uuid,
  $9::text, $10::jsonb, $11::text, $12::uuid, $13::boolean, $14::int, $15::int)`;

export type LeadCreateOpts = {
  requester?: string;
  cart: string;
  stationery: string;
  list?: string;
  itemCount?: number;
  key?: string;
  isDemo?: boolean;
  neighborhood?: string | null;
};

/** `lead_create` real (service_role) com `itemCount` itens: é a porta que o gatilho de cobrança precisa cobrir. */
export async function leadCreate(c: Client, o: LeadCreateOpts): Promise<HintAttempt> {
  const muni = (await c.query("select id from public.municipalities order by ibge_code limit 1")).rows[0].id as string;
  const n = o.itemCount ?? 2;
  const items = Array.from({ length: n }, (_, i) => ({ name: `Item ${i + 1}`, item_key: `item ${i + 1}`, quantity: 1 }));
  return attemptH(c, LEAD_CREATE, [
    o.requester ?? IDS.parent,
    o.cart,
    o.list ?? randomUUID(),
    o.stationery,
    "Escola Demonstração",
    "5º ano",
    2027,
    muni,
    o.neighborhood === undefined ? "centro" : o.neighborhood,
    JSON.stringify(items),
    "v1",
    o.key ?? randomUUID(),
    o.isDemo ?? true,
    10,
    5,
  ]);
}
