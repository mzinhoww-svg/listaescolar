import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { BILLING_ERROR_CODES, BillingError, type BillingErrorCode } from "./errors";
import type {
  ActivePlan,
  BillingStore,
  InvoiceProvider,
  InvoiceView,
  LedgerEntryView,
  PaymentAlertView,
  PlanDraft,
  SeasonPassView,
  WalletSummary,
} from "./ports";

// Escritas: SEMPRE pelas funções SQL (service_role, EXECUTE só dele) da 0401_billing.sql. Leituras: cliente de
// SERVIÇO com filtro EXPLÍCITO pelo dono (mesmo padrão de features/leads/repository.ts) — a maioria das funções de
// leitura aqui NÃO confere posse (billing_wallet_summary, por exemplo, não é `billing_check_member`), então quem
// chama este módulo confere posse ANTES (requireMemberOrAdmin) e sempre com o mesmo predicado da política RLS.

const HINT_CODES: ReadonlySet<string> = new Set<BillingErrorCode>(BILLING_ERROR_CODES.filter((c) => c !== "database" && c !== "payments_unavailable"));

function dbErrorCode(error: { code?: string; hint?: string | null }): BillingErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as BillingErrorCode;
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514":
      return "invalid_input";
    default:
      return "database";
  }
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: BillingErrorCode): never {
  throw new BillingError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new BillingError("ator não vem da sessão", "forbidden");
}

async function requireMemberOrAdmin(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<void> {
  requireActor(actor);
  if (actor.role === "admin") return;
  const { data, error } = await admin
    .from("stationery_members")
    .select("profile_id")
    .eq("stationery_id", stationeryId)
    .eq("profile_id", actor.userId)
    .maybeSingle();
  if (error) fail("conferir posse da papelaria", error);
  if (!data) throw new BillingError("ator não é membro desta papelaria", "forbidden");
}

async function requireAdmin(actor: SessionActor): Promise<void> {
  requireActor(actor);
  if (actor.role !== "admin") throw new BillingError("só a equipe administra planos", "forbidden");
}

// ---------------------------------------------------------------------------
// Plano ativo / histórico
// ---------------------------------------------------------------------------

const tierRow = z.object({ id: z.uuid(), min_items: z.number().int(), max_items: z.number().int().nullable(), price_cents: z.number().int() });
const packageRow = z.object({ id: z.uuid(), amount_cents: z.number().int() });
const planRow = z.object({
  id: z.uuid(),
  version: z.number().int(),
  status: z.enum(["active", "archived"]),
  free_leads: z.number().int(),
  free_leads_validity_days: z.number().int().nullable(),
  pass_price_cents: z.number().int().nullable(),
  pass_included_leads: z.number().int().nullable(),
  pass_max_installments: z.number().int().nullable(),
  season_start_month: z.number().int(),
  season_end_month: z.number().int(),
});

async function loadPlan(admin: SupabaseClient, planId: string): Promise<ActivePlan> {
  const [planRes, tiersRes, packagesRes] = await Promise.all([
    admin.from("plans").select("*").eq("id", planId).single(),
    admin.from("plan_price_tiers").select("id, min_items, max_items, price_cents").eq("plan_id", planId).order("position"),
    admin.from("plan_credit_packages").select("id, amount_cents").eq("plan_id", planId).order("position"),
  ]);
  if (planRes.error) fail("ler plano", planRes.error);
  if (tiersRes.error) fail("ler faixas do plano", tiersRes.error);
  if (packagesRes.error) fail("ler pacotes do plano", packagesRes.error);
  const p = planRow.parse(planRes.data);
  const tiers = z.array(tierRow).parse(tiersRes.data ?? []);
  const packages = z.array(packageRow).parse(packagesRes.data ?? []);
  return {
    id: p.id,
    version: p.version,
    freeLeads: p.free_leads,
    freeLeadsValidityDays: p.free_leads_validity_days,
    seasonStartMonth: p.season_start_month,
    seasonEndMonth: p.season_end_month,
    tiers: tiers.map((t) => ({ minItems: t.min_items, maxItems: t.max_items, priceCents: t.price_cents })),
    packages: packages.map((k) => ({ id: k.id, amountCents: k.amount_cents })),
    pass:
      p.pass_price_cents === null || p.pass_included_leads === null || p.pass_max_installments === null
        ? null
        : { priceCents: p.pass_price_cents, includedLeads: p.pass_included_leads, maxInstallments: p.pass_max_installments },
  };
}

/** Plano ativo (público para `authenticated`, RLS `status = 'active'`); `null` sem plano publicado ainda. */
export async function getActivePlan(admin: SupabaseClient): Promise<ActivePlan | null> {
  const { data, error } = await admin.from("plans").select("id").eq("status", "active").maybeSingle();
  if (error) fail("ler plano ativo", error);
  if (!data) return null;
  return loadPlan(admin, z.object({ id: z.uuid() }).parse(data).id);
}

/** Histórico de versões (admin only: tiers/pacotes de planos arquivados não são legíveis por `authenticated`). */
export async function listPlanHistory(admin: SupabaseClient, actor: SessionActor): Promise<ActivePlan[]> {
  await requireAdmin(actor);
  const { data, error } = await admin.from("plans").select("id").order("version", { ascending: false });
  if (error) fail("ler histórico de planos", error);
  const ids = z.array(z.object({ id: z.uuid() })).parse(data ?? []).map((r) => r.id);
  return Promise.all(ids.map((id) => loadPlan(admin, id)));
}

/** `billing_plan_publish`: só admin (a função confere de novo, em profundidade). */
export async function publishPlan(admin: SupabaseClient, actor: SessionActor, draft: PlanDraft): Promise<string> {
  await requireAdmin(actor);
  const payload = {
    free_leads: draft.freeLeads,
    free_leads_validity_days: draft.freeLeadsValidityDays,
    season: { start_month: draft.season.startMonth, end_month: draft.season.endMonth },
    tiers: draft.tiers.map((t) => ({ min_items: t.minItems, max_items: t.maxItems, price_cents: t.priceCents })),
    packages: draft.packages.map((k) => ({ amount_cents: k.amountCents })),
    pass: draft.pass ? { price_cents: draft.pass.priceCents, included_leads: draft.pass.includedLeads, max_installments: draft.pass.maxInstallments } : null,
  };
  const { data, error } = await admin.rpc("billing_plan_publish", { p_actor_id: actor.userId, p_plan: payload });
  if (error) fail("publicar plano", error);
  return z.uuid().parse(data);
}

// ---------------------------------------------------------------------------
// Carteira / resumo
// ---------------------------------------------------------------------------

const summaryJson = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    balance_cents: z.number().int(),
    free_granted: z.number().int(),
    free_left: z.number().int(),
    free_expires_at: z.string().nullable(),
    plan: z.object({ id: z.uuid(), version: z.number().int() }),
    active_pass: z
      .object({ id: z.uuid(), included_leads: z.number().int(), leads_left: z.number().int(), season_start: z.string(), season_end: z.string() })
      .nullable(),
    can_receive_min_tier: z.boolean(),
    min_tier_price_cents: z.number().int().nullable(),
  }),
]);

function mapSummary(s: z.infer<typeof summaryJson>): WalletSummary {
  if (!s.available) return { available: false };
  return {
    available: true,
    balanceCents: s.balance_cents,
    freeGranted: s.free_granted,
    freeLeft: s.free_left,
    freeExpiresAt: s.free_expires_at === null ? null : new Date(s.free_expires_at),
    planVersion: s.plan.version,
    activePass: s.active_pass
      ? { id: s.active_pass.id, includedLeads: s.active_pass.included_leads, leadsLeft: s.active_pass.leads_left, seasonStart: s.active_pass.season_start, seasonEnd: s.active_pass.season_end }
      : null,
    canReceiveMinTier: s.can_receive_min_tier,
    minTierPriceCents: s.min_tier_price_cents,
  };
}

/** Carteira da PRÓPRIA papelaria (Pap06): cria a carteira se faltar (é a ação explícita da dona olhar o próprio saldo). */
export async function getSummary(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<WalletSummary> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.rpc("billing_wallet_summary", { p_stationery_id: stationeryId });
  if (error) fail("ler resumo da carteira", error);
  return mapSummary(summaryJson.parse(data));
}

/**
 * Revisão de segurança (S21): leitura PASSIVA de terceiro (admin navegando papelarias) — NUNCA cria a carteira.
 * Sem carteira, projeta os valores do plano ativo (mesmo formato de `getSummary`, sem gravar nada).
 */
export async function getSummaryReadOnly(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<WalletSummary> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.rpc("billing_wallet_summary_readonly", { p_stationery_id: stationeryId });
  if (error) fail("ler resumo da carteira (leitura)", error);
  return mapSummary(summaryJson.parse(data));
}

/** `is_demo` da papelaria (dado já público via `stationery_public`): usado para escolher o `PaymentProvider`. */
export async function getStationeryBillingInfo(admin: SupabaseClient, stationeryId: string): Promise<{ isDemo: boolean; cnpj: string; tradeName: string } | null> {
  const { data, error } = await admin.from("stationeries").select("is_demo, cnpj, trade_name").eq("id", stationeryId).maybeSingle();
  if (error) fail("ler papelaria", error);
  if (!data) return null;
  const r = z.object({ is_demo: z.boolean(), cnpj: z.string(), trade_name: z.string() }).parse(data);
  return { isDemo: r.is_demo, cnpj: r.cnpj, tradeName: r.trade_name };
}

// ---------------------------------------------------------------------------
// Extrato, faturas, passes
// ---------------------------------------------------------------------------

const ledgerRow = z.object({
  id: z.uuid(),
  entry_type: z.enum(["topup", "lead_debit", "free_lead", "pass_lead", "reversal"]),
  amount_cents: z.number().int(),
  balance_after_cents: z.number().int(),
  lead_id: z.uuid().nullable(),
  invoice_id: z.uuid().nullable(),
  item_count: z.number().int().nullable(),
  reason: z.string().nullable(),
  created_at: z.string(),
});

async function walletIdFor(admin: SupabaseClient, stationeryId: string): Promise<string | null> {
  const { data, error } = await admin.from("stationery_wallets").select("id").eq("stationery_id", stationeryId).maybeSingle();
  if (error) fail("ler carteira", error);
  return data ? z.object({ id: z.uuid() }).parse(data).id : null;
}

export async function listStatement(admin: SupabaseClient, actor: SessionActor, stationeryId: string, limit = 200): Promise<LedgerEntryView[]> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const walletId = await walletIdFor(admin, stationeryId);
  if (!walletId) return [];
  const { data, error } = await admin
    .from("credit_ledger")
    .select("id, entry_type, amount_cents, balance_after_cents, lead_id, invoice_id, item_count, reason, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) fail("ler extrato", error);
  const rows = z.array(ledgerRow).parse(data ?? []);

  const { data: reversedRows, error: reversedErr } = await admin.from("credit_ledger").select("reverses_entry_id").not("reverses_entry_id", "is", null).eq("wallet_id", walletId);
  if (reversedErr) fail("ler estornos", reversedErr);
  const reversedIds = new Set(z.array(z.object({ reverses_entry_id: z.uuid() })).parse(reversedRows ?? []).map((r) => r.reverses_entry_id));

  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((v): v is string => v !== null))];
  const leadsById = new Map<string, { code: string; schoolName: string }>();
  if (leadIds.length > 0) {
    const { data: leadsData, error: leadsErr } = await admin.from("leads").select("id, code, school_name").in("id", leadIds);
    if (leadsErr) fail("ler leads do extrato", leadsErr);
    for (const l of z.array(z.object({ id: z.uuid(), code: z.string(), school_name: z.string() })).parse(leadsData ?? [])) {
      leadsById.set(l.id, { code: l.code, schoolName: l.school_name });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    entryType: r.entry_type,
    amountCents: r.amount_cents,
    balanceAfterCents: r.balance_after_cents,
    leadId: r.lead_id,
    leadCode: r.lead_id ? leadsById.get(r.lead_id)?.code ?? null : null,
    schoolName: r.lead_id ? leadsById.get(r.lead_id)?.schoolName ?? null : null,
    invoiceId: r.invoice_id,
    itemCount: r.item_count,
    reason: r.reason,
    reversed: reversedIds.has(r.id),
    createdAt: new Date(r.created_at),
  }));
}

const invoiceRow = z.object({
  id: z.uuid(),
  kind: z.enum(["credit_package", "season_pass_installment"]),
  season_pass_id: z.uuid().nullable(),
  installment_no: z.number().int().nullable(),
  amount_cents: z.number().int(),
  due_date: z.string(),
  status: z.enum(["open", "paid", "cancelled"]),
  provider: z.enum(["fake", "demo", "pix"]),
  is_demo: z.boolean(),
  provider_charge_id: z.string().nullable(),
  pix_copy_paste: z.string().nullable(),
  charge_expires_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  paid_amount_cents: z.number().int().nullable(),
  created_at: z.string(),
});

function toInvoiceView(r: z.infer<typeof invoiceRow>): InvoiceView {
  return {
    id: r.id,
    kind: r.kind,
    seasonPassId: r.season_pass_id,
    installmentNo: r.installment_no,
    amountCents: r.amount_cents,
    dueDate: r.due_date,
    status: r.status,
    provider: r.provider,
    isDemo: r.is_demo,
    providerChargeId: r.provider_charge_id,
    pixCopyPaste: r.pix_copy_paste,
    chargeExpiresAt: r.charge_expires_at ? new Date(r.charge_expires_at) : null,
    paidAt: r.paid_at ? new Date(r.paid_at) : null,
    paidAmountCents: r.paid_amount_cents,
    createdAt: new Date(r.created_at),
  };
}

const INVOICE_COLUMNS =
  "id, kind, season_pass_id, installment_no, amount_cents, due_date, status, provider, is_demo, provider_charge_id, pix_copy_paste, charge_expires_at, paid_at, paid_amount_cents, created_at";

export async function listInvoices(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<InvoiceView[]> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.from("invoices").select(INVOICE_COLUMNS).eq("stationery_id", stationeryId).order("created_at", { ascending: false });
  if (error) fail("ler faturas", error);
  return z.array(invoiceRow).parse(data ?? []).map(toInvoiceView);
}

/** `null` tanto para "não existe" quanto para "é de outra papelaria" — não revela existência alheia. */
export async function getInvoice(admin: SupabaseClient, actor: SessionActor, stationeryId: string, invoiceId: string): Promise<InvoiceView | null> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.from("invoices").select(INVOICE_COLUMNS).eq("id", invoiceId).eq("stationery_id", stationeryId).maybeSingle();
  if (error) fail("ler fatura", error);
  return data ? toInvoiceView(invoiceRow.parse(data)) : null;
}

const passRow = z.object({
  id: z.uuid(),
  status: z.enum(["pending_payment", "active", "cancelled"]),
  price_cents: z.number().int(),
  included_leads: z.number().int(),
  installments: z.number().int(),
  season_start: z.string(),
  season_end: z.string(),
  activated_at: z.string().nullable(),
});

export async function listSeasonPasses(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<SeasonPassView[]> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin
    .from("season_passes")
    .select("id, status, price_cents, included_leads, installments, season_start, season_end, activated_at")
    .eq("stationery_id", stationeryId)
    .order("season_start", { ascending: false });
  if (error) fail("ler passes", error);
  return z.array(passRow).parse(data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    priceCents: r.price_cents,
    includedLeads: r.included_leads,
    installments: r.installments,
    seasonStart: r.season_start,
    seasonEnd: r.season_end,
    activatedAt: r.activated_at ? new Date(r.activated_at) : null,
  }));
}

// ---------------------------------------------------------------------------
// Escritas (compra, cobrança, confirmação, estorno)
// ---------------------------------------------------------------------------

export async function createPackageInvoice(
  admin: SupabaseClient,
  actor: SessionActor,
  input: { stationeryId: string; packageId: string; provider: InvoiceProvider; idempotencyKey: string; termsVersion: string },
): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("billing_create_package_invoice", {
    p_actor_id: actor.userId,
    p_stationery_id: input.stationeryId,
    p_package_id: input.packageId,
    p_provider: input.provider,
    p_idempotency_key: input.idempotencyKey,
    p_terms_version: input.termsVersion,
  });
  if (error) fail("criar fatura de pacote", error);
  return z.uuid().parse(data);
}

export async function purchaseSeasonPass(
  admin: SupabaseClient,
  actor: SessionActor,
  input: { stationeryId: string; installments: number; provider: InvoiceProvider; idempotencyKey: string; termsVersion: string },
): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("billing_purchase_season_pass", {
    p_actor_id: actor.userId,
    p_stationery_id: input.stationeryId,
    p_installments: input.installments,
    p_provider: input.provider,
    p_idempotency_key: input.idempotencyKey,
    p_terms_version: input.termsVersion,
  });
  if (error) fail("comprar passe de temporada", error);
  return z.uuid().parse(data);
}

// `out_*`: a função SQL usa esses nomes de saída para não colidir com as colunas de mesmo nome que ela referencia
// internamente (plpgsql trata isso como erro de ambiguidade, não como aviso).
const attachChargeRow = z.object({ out_provider_charge_id: z.string(), out_pix_copy_paste: z.string().nullable(), out_charge_expires_at: z.string().nullable() });

export async function attachCharge(
  admin: SupabaseClient,
  input: {
    invoiceId: string;
    provider: InvoiceProvider;
    expectedCurrentChargeId: string | null;
    providerChargeId: string;
    pixCopyPaste: string | null;
    chargeExpiresAt: Date | null;
  },
): Promise<{ providerChargeId: string; pixCopyPaste: string | null; chargeExpiresAt: Date | null }> {
  const { data, error } = await admin.rpc("billing_attach_charge", {
    p_invoice_id: input.invoiceId,
    p_provider: input.provider,
    p_expected_current_charge_id: input.expectedCurrentChargeId,
    p_provider_charge_id: input.providerChargeId,
    p_pix_copy_paste: input.pixCopyPaste,
    p_charge_expires_at: input.chargeExpiresAt ? input.chargeExpiresAt.toISOString() : null,
  });
  if (error) fail("anexar cobrança", error);
  const row = z.array(attachChargeRow).length(1).parse(data)[0]!;
  return {
    providerChargeId: row.out_provider_charge_id,
    pixCopyPaste: row.out_pix_copy_paste,
    chargeExpiresAt: row.out_charge_expires_at ? new Date(row.out_charge_expires_at) : null,
  };
}

export async function confirmInvoicePayment(
  admin: SupabaseClient,
  input: { invoiceId: string; provider: InvoiceProvider; providerRef: string; amountCents: number; paidAt: Date },
): Promise<boolean> {
  const { data, error } = await admin.rpc("billing_confirm_invoice_payment", {
    p_invoice_id: input.invoiceId,
    p_provider: input.provider,
    p_provider_ref: input.providerRef,
    p_amount_cents: input.amountCents,
    p_paid_at: input.paidAt.toISOString(),
  });
  if (error) fail("confirmar pagamento", error);
  return z.boolean().parse(data);
}

/**
 * Sem `SessionActor`: usada só pelo webhook/cron (sistema), nunca por uma rota alcançável pelo navegador. Revisão de
 * segurança: resolve por QUALQUER txid já emitido para a fatura (via `invoice_charges`, histórico completo), não só
 * o `provider_charge_id` ATUAL — um pagamento feito numa cobrança regenerada (ou perdida numa corrida) ainda é
 * encontrado.
 */
export async function findOpenInvoiceByChargeId(admin: SupabaseClient, chargeId: string): Promise<{ invoiceId: string; amountCents: number } | null> {
  const { data: chargeRow, error: chargeErr } = await admin.from("invoice_charges").select("invoice_id").eq("provider", "pix").eq("provider_charge_id", chargeId).maybeSingle();
  if (chargeErr) fail("ler histórico de cobranças", chargeErr);
  if (!chargeRow) return null;
  const invoiceId = z.object({ invoice_id: z.uuid() }).parse(chargeRow).invoice_id;
  const { data, error } = await admin.from("invoices").select("id, amount_cents").eq("id", invoiceId).eq("status", "open").maybeSingle();
  if (error) fail("ler fatura pelo id da cobrança", error);
  if (!data) return null;
  const r = z.object({ id: z.uuid(), amount_cents: z.number().int() }).parse(data);
  return { invoiceId: r.id, amountCents: r.amount_cents };
}

/**
 * D-101 (S23, revisão de segurança da S21): quando o webhook recebe uma notificação para um txid que já pertence a
 * uma fatura, mas ela NÃO está mais aberta (já paga ou cancelada), `findOpenInvoiceByChargeId` devolve `null` e o
 * pagamento era ignorado em silêncio. Esta função resolve por QUALQUER status, para o chamador decidir se vale
 * registrar um alerta (nunca recreditar sozinho).
 */
export async function findAnyInvoiceByChargeId(admin: SupabaseClient, chargeId: string): Promise<{ invoiceId: string; status: "open" | "paid" | "cancelled" } | null> {
  const { data: chargeRow, error: chargeErr } = await admin.from("invoice_charges").select("invoice_id").eq("provider", "pix").eq("provider_charge_id", chargeId).maybeSingle();
  if (chargeErr) fail("ler histórico de cobranças", chargeErr);
  if (!chargeRow) return null;
  const invoiceId = z.object({ invoice_id: z.uuid() }).parse(chargeRow).invoice_id;
  const { data, error } = await admin.from("invoices").select("id, status").eq("id", invoiceId).maybeSingle();
  if (error) fail("ler fatura pelo id da cobrança", error);
  if (!data) return null;
  const r = z.object({ id: z.uuid(), status: z.enum(["open", "paid", "cancelled"]) }).parse(data);
  return { invoiceId: r.id, status: r.status };
}

/** D-101: registra o alerta (idempotente por invoice+provider+charge); admin resolve manualmente pelo Admin13. */
export async function flagLatePayment(
  admin: SupabaseClient,
  input: { invoiceId: string; provider: InvoiceProvider; providerChargeId: string; amountCents: number },
): Promise<string> {
  const { data, error } = await admin.rpc("billing_flag_late_payment", {
    p_invoice_id: input.invoiceId,
    p_provider: input.provider,
    p_provider_charge_id: input.providerChargeId,
    p_amount_cents: input.amountCents,
    // sempre 'system': só o webhook/cron chama esta função (nenhuma sessão de usuário aciona), revisão de segurança.
    p_actor_role: "system",
  });
  if (error) fail("registrar alerta de pagamento tardio", error);
  return z.uuid().parse(data);
}

const paymentAlertRow = z.object({
  id: z.uuid(),
  invoice_id: z.uuid(),
  provider: z.enum(["fake", "demo", "pix"]),
  provider_charge_id: z.string(),
  amount_cents: z.number().int(),
  invoice_status_at_detection: z.enum(["paid", "cancelled"]),
  detected_at: z.string(),
  resolved_at: z.string().nullable(),
  resolved_by: z.uuid().nullable(),
  resolution_note: z.string().nullable(),
});

/** Fila de alertas (Admin13, conciliação); admin only. */
export async function listPaymentAlerts(admin: SupabaseClient, actor: SessionActor): Promise<PaymentAlertView[]> {
  await requireAdmin(actor);
  const { data, error } = await admin.from("billing_payment_alerts").select("*").order("detected_at", { ascending: false }).limit(200);
  if (error) fail("listar alertas de pagamento", error);
  return z.array(paymentAlertRow).parse(data ?? []).map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    provider: r.provider,
    providerChargeId: r.provider_charge_id,
    amountCents: r.amount_cents,
    invoiceStatusAtDetection: r.invoice_status_at_detection,
    detectedAt: new Date(r.detected_at),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    resolutionNote: r.resolution_note,
  }));
}

export async function resolvePaymentAlert(admin: SupabaseClient, actor: SessionActor, input: { alertId: string; note: string | null }): Promise<string> {
  await requireAdmin(actor);
  const { data, error } = await admin.rpc("billing_resolve_payment_alert", { p_actor_id: actor.userId, p_alert_id: input.alertId, p_note: input.note });
  if (error) fail("resolver alerta de pagamento", error);
  return z.uuid().parse(data);
}

/**
 * As faturas abertas mais ANTIGAS primeiro (`created_at asc`, até `limit`): um lote que não cabe no orçamento de
 * tempo do cron continua no dia seguinte, sem starvation. Revisão de segurança: devolve TODO txid já emitido para
 * cada uma (via `invoice_charges`), não só o atual — o cron reconcilia cobranças regeneradas/perdidas também.
 */
export async function listOpenPixChargeIds(admin: SupabaseClient, limit: number): Promise<string[]> {
  const { data: invoicesData, error: invoicesErr } = await admin.from("invoices").select("id").eq("provider", "pix").eq("status", "open").order("created_at", { ascending: true }).limit(limit);
  if (invoicesErr) fail("listar faturas Pix abertas", invoicesErr);
  const ids = z.array(z.object({ id: z.uuid() })).parse(invoicesData ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data, error } = await admin.from("invoice_charges").select("provider_charge_id").eq("provider", "pix").in("invoice_id", ids);
  if (error) fail("listar cobranças Pix abertas", error);
  return z.array(z.object({ provider_charge_id: z.string() })).parse(data ?? []).map((r) => r.provider_charge_id);
}

export async function reverseEntry(
  admin: SupabaseClient,
  input: { entryId: string; actorId: string | null; actorRole: "admin" | "system"; reason: string | null },
): Promise<string> {
  const { data, error } = await admin.rpc("billing_reverse_entry", {
    p_entry_id: input.entryId,
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole,
    p_reason: input.reason,
  });
  if (error) fail("estornar lançamento", error);
  return z.uuid().parse(data);
}

// ---------------------------------------------------------------------------
// Fábrica: agrupa as funções acima no formato `BillingStore` (ports.ts) para o serviço.
// ---------------------------------------------------------------------------

export function createBillingStore(admin: SupabaseClient): BillingStore {
  return {
    getActivePlan: () => getActivePlan(admin),
    listPlanHistory: (actor) => listPlanHistory(admin, actor),
    publishPlan: (actor, plan) => publishPlan(admin, actor, plan),
    getSummary: (actor, stationeryId) => getSummary(admin, actor, stationeryId),
    getSummaryReadOnly: (actor, stationeryId) => getSummaryReadOnly(admin, actor, stationeryId),
    listStatement: (actor, stationeryId, limit) => listStatement(admin, actor, stationeryId, limit),
    listInvoices: (actor, stationeryId) => listInvoices(admin, actor, stationeryId),
    getInvoice: (actor, stationeryId, invoiceId) => getInvoice(admin, actor, stationeryId, invoiceId),
    listSeasonPasses: (actor, stationeryId) => listSeasonPasses(admin, actor, stationeryId),
    createPackageInvoice: (actor, input) => createPackageInvoice(admin, actor, input),
    purchaseSeasonPass: (actor, input) => purchaseSeasonPass(admin, actor, input),
    attachCharge: (input) => attachCharge(admin, input),
    confirmInvoicePayment: (input) => confirmInvoicePayment(admin, input),
    reverseEntry: (input) => reverseEntry(admin, input),
    getStationeryBillingInfo: (stationeryId) => getStationeryBillingInfo(admin, stationeryId),
    findOpenInvoiceByChargeId: (chargeId) => findOpenInvoiceByChargeId(admin, chargeId),
    findAnyInvoiceByChargeId: (chargeId) => findAnyInvoiceByChargeId(admin, chargeId),
    flagLatePayment: (input) => flagLatePayment(admin, input),
    listOpenPixChargeIds: (limit) => listOpenPixChargeIds(admin, limit),
    listPaymentAlerts: (actor) => listPaymentAlerts(admin, actor),
    resolvePaymentAlert: (actor, input) => resolvePaymentAlert(admin, actor, input),
  };
}
