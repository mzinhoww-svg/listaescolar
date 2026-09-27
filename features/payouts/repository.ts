import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { PAYOUT_ERROR_CODES, PayoutError, type PayoutErrorCode } from "./errors";
import type {
  DelinquencyRow,
  PayoutBatchView,
  PayoutSettingsView,
  PayoutStore,
  PayoutTarget,
  PendingRepasseView,
  PerformanceSummary,
  PixKeyKind,
  SalePaymentView,
  SchoolPayoutConfigView,
} from "./ports";

// Escritas: SEMPRE pelas funções SQL da 0403 (service_role, EXECUTE só dele). Leituras: cliente de SERVIÇO com
// checagem de admin EXPLÍCITA em código (mesmo padrão de features/billing/repository.ts e features/conversion/
// repository.ts) — nenhuma destas tabelas tem política de RLS para `authenticated` (grants só para service_role).

const HINT_CODES: ReadonlySet<string> = new Set<PayoutErrorCode>(PAYOUT_ERROR_CODES.filter((c) => c !== "database"));

function dbErrorCode(error: { code?: string; hint?: string | null }): PayoutErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as PayoutErrorCode;
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

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: PayoutErrorCode): never {
  throw new PayoutError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new PayoutError("ator não vem da sessão", "forbidden");
}

/** Admin ou o próprio sistema (S23 não tem leitura para stationery_member: as telas são só do admin). */
function requireAdmin(actor: SessionActor): void {
  requireActor(actor);
  if (actor.role !== "admin") throw new PayoutError("só a equipe administra comissão e repasses", "forbidden");
}

/** Mesmo predicado de posse usado em `features/billing/repository.ts` (requireMemberOrAdmin): admin OU vínculo em `stationery_members`. */
async function requireStationeryAccess(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<void> {
  requireActor(actor);
  if (actor.role === "admin") return;
  const { data, error } = await admin.from("stationery_members").select("stationery_id").eq("stationery_id", stationeryId).eq("profile_id", actor.userId).maybeSingle();
  if (error) fail("conferir vínculo com a papelaria", error);
  if (!data) throw new PayoutError("ator não é membro desta papelaria", "forbidden");
}

function maskPixKey(key: string | null): string | null {
  if (!key) return null;
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// payout_settings
// ---------------------------------------------------------------------------

const settingsRow = z.object({ id: z.uuid(), commission_bps: z.number().int(), grace_days: z.number().int(), block_days: z.number().int(), created_at: z.string() });

export async function getActiveSettings(admin: SupabaseClient): Promise<PayoutSettingsView | null> {
  const { data, error } = await admin.from("payout_settings").select("*").eq("status", "active").maybeSingle();
  if (error) fail("ler comissão vigente", error);
  if (!data) return null;
  const r = settingsRow.parse(data);
  return { id: r.id, commissionBps: r.commission_bps, graceDays: r.grace_days, blockDays: r.block_days, createdAt: new Date(r.created_at) };
}

export async function publishSettings(admin: SupabaseClient, actor: SessionActor, input: { commissionBps: number; graceDays: number; blockDays: number }): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_settings_publish", {
    p_actor_id: actor.userId,
    p_commission_bps: input.commissionBps,
    p_grace_days: input.graceDays,
    p_block_days: input.blockDays,
  });
  if (error) fail("publicar comissão", error);
  return z.uuid().parse(data);
}

// ---------------------------------------------------------------------------
// school_payout_settings
// ---------------------------------------------------------------------------

const schoolConfigRow = z.object({
  id: z.uuid(),
  school_id: z.uuid(),
  target: z.enum(["none", "school", "apm"]),
  payout_bps: z.number().int(),
  beneficiary_name: z.string().nullable(),
  pix_key: z.string().nullable(),
  pix_key_kind: z.enum(["cpf", "cnpj", "email", "phone", "random"]).nullable(),
  created_at: z.string(),
});

export async function listSchoolConfigs(admin: SupabaseClient, actor: SessionActor): Promise<SchoolPayoutConfigView[]> {
  requireAdmin(actor);
  const { data, error } = await admin.from("school_payout_settings").select("*, schools(name)").eq("status", "active").order("created_at", { ascending: false });
  if (error) fail("listar repasses de escola", error);
  const rows = z.array(schoolConfigRow.extend({ schools: z.object({ name: z.string() }).nullable() })).parse(data ?? []);
  return rows.map((r) => ({
    id: r.id,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? "Escola",
    target: r.target as PayoutTarget,
    payoutBps: r.payout_bps,
    beneficiaryName: r.beneficiary_name,
    pixKeyKind: r.pix_key_kind as PixKeyKind | null,
    pixKeyMasked: maskPixKey(r.pix_key),
    createdAt: new Date(r.created_at),
  }));
}

export async function publishSchoolConfig(
  admin: SupabaseClient,
  actor: SessionActor,
  input: { schoolId: string; target: PayoutTarget; payoutBps: number; beneficiaryName: string | null; pixKey: string | null; pixKeyKind: PixKeyKind | null },
): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_school_config_publish", {
    p_actor_id: actor.userId,
    p_school_id: input.schoolId,
    p_target: input.target,
    p_payout_bps: input.payoutBps,
    p_beneficiary_name: input.beneficiaryName,
    p_pix_key: input.pixKey,
    p_pix_key_kind: input.pixKeyKind,
  });
  if (error) fail("publicar repasse de escola", error);
  return z.uuid().parse(data);
}

/**
 * Nome e id da escola não são dado sensível (já públicos em `/escolas/[inep]`, S04): qualquer ator autenticado pode
 * listar, não só admin — é isso que deixa a papelaria escolher a escola certa ao confirmar "Pix pela plataforma"
 * (Pap03), sem depender de resolução automática por `leads.list_id` (que não tem FK, ver Ruling do cabeçalho).
 */
export async function listSchoolOptions(admin: SupabaseClient, actor: SessionActor): Promise<{ id: string; name: string }[]> {
  requireActor(actor);
  const { data, error } = await admin.from("schools").select("id, name").order("name").limit(500);
  if (error) fail("listar escolas", error);
  return z.array(z.object({ id: z.uuid(), name: z.string() })).parse(data ?? []);
}

// ---------------------------------------------------------------------------
// sale_payments / payout_ledger
// ---------------------------------------------------------------------------

export async function confirmSale(admin: SupabaseClient, actor: SessionActor, input: { leadId: string; schoolId: string | null }): Promise<string> {
  requireActor(actor);
  const actorRole = actor.role === "admin" ? "admin" : actor.role === "stationery_member" ? "stationery_member" : null;
  if (!actorRole) throw new PayoutError("só a papelaria ou a equipe confirma uma venda", "forbidden");
  const { data, error } = await admin.rpc("payout_confirm_sale", {
    p_actor_id: actor.userId,
    p_actor_role: actorRole,
    p_lead_id: input.leadId,
    p_school_id: input.schoolId,
  });
  if (error) fail("confirmar venda", error);
  return z.uuid().parse(data);
}

const saleRow = z.object({
  id: z.uuid(),
  lead_id: z.uuid(),
  stationery_id: z.uuid(),
  school_id: z.uuid().nullable(),
  amount_cents: z.number().int(),
  commission_bps_snapshot: z.number().int(),
  is_demo: z.boolean(),
  created_at: z.string(),
  leads: z.object({ code: z.string() }).nullable(),
  stationeries: z.object({ trade_name: z.string() }).nullable(),
  schools: z.object({ name: z.string() }).nullable(),
});

export async function listRecentSalePayments(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<SalePaymentView[]> {
  requireAdmin(actor);
  const { data, error } = await admin
    .from("sale_payments")
    .select("*, leads(code), stationeries(trade_name), schools(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar vendas confirmadas", error);
  const rows = z.array(saleRow).parse(data ?? []);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: ledgerData, error: ledgerErr } = await admin
    .from("payout_ledger")
    .select("sale_payment_id, entry_type, beneficiary_type, amount_cents")
    .in("sale_payment_id", ids);
  if (ledgerErr) fail("ler lançamentos das vendas", ledgerErr);
  const ledgerRows = z
    .array(z.object({ sale_payment_id: z.uuid().nullable(), entry_type: z.string(), beneficiary_type: z.string(), amount_cents: z.number().int() }))
    .parse(ledgerData ?? []);
  return rows.map((r) => {
    const own = ledgerRows.filter((l) => l.sale_payment_id === r.id);
    const commission = own.find((l) => l.entry_type === "commission")?.amount_cents ?? 0;
    const repasse = own.find((l) => l.entry_type === "repasse_due");
    return {
      id: r.id,
      leadId: r.lead_id,
      leadCode: r.leads?.code ?? "—",
      stationeryId: r.stationery_id,
      stationeryName: r.stationeries?.trade_name ?? "Papelaria",
      schoolId: r.school_id,
      schoolName: r.schools?.name ?? null,
      amountCents: r.amount_cents,
      commissionCents: commission,
      repasseCents: repasse?.amount_cents ?? 0,
      repasseTarget: (repasse?.beneficiary_type as PayoutTarget | undefined) ?? null,
      isDemo: r.is_demo,
      createdAt: new Date(r.created_at),
    };
  });
}

export async function getSaleForLead(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<SalePaymentView | null> {
  requireActor(actor);
  // revisão de segurança: confere o vínculo com a papelaria do LEAD (não só o papel do ator) antes de ler
  // qualquer coisa — sem isso, um stationery_member conseguia ler valor/comissão/repasse de um lead de OUTRA
  // papelaria só trocando o leadId (mesma classe de vazamento de listConfirmableLeadsForStationery, já corrigida).
  const { data: leadRow, error: leadErr } = await admin.from("leads").select("stationery_id").eq("id", leadId).maybeSingle();
  if (leadErr) fail("ler papelaria do lead", leadErr);
  if (!leadRow) return null;
  await requireStationeryAccess(admin, actor, z.object({ stationery_id: z.uuid() }).parse(leadRow).stationery_id);

  const { data, error } = await admin.from("sale_payments").select("*, leads(code), stationeries(trade_name), schools(name)").eq("lead_id", leadId).maybeSingle();
  if (error) fail("ler venda confirmada do lead", error);
  if (!data) return null;
  const r = saleRow.parse(data);
  const { data: ledgerData, error: ledgerErr } = await admin.from("payout_ledger").select("entry_type, beneficiary_type, amount_cents").eq("sale_payment_id", r.id);
  if (ledgerErr) fail("ler lançamentos da venda", ledgerErr);
  const ledgerRows = z.array(z.object({ entry_type: z.string(), beneficiary_type: z.string(), amount_cents: z.number().int() })).parse(ledgerData ?? []);
  const commission = ledgerRows.find((l) => l.entry_type === "commission")?.amount_cents ?? 0;
  const repasse = ledgerRows.find((l) => l.entry_type === "repasse_due");
  return {
    id: r.id,
    leadId: r.lead_id,
    leadCode: r.leads?.code ?? "—",
    stationeryId: r.stationery_id,
    stationeryName: r.stationeries?.trade_name ?? "Papelaria",
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? null,
    amountCents: r.amount_cents,
    commissionCents: commission,
    repasseCents: repasse?.amount_cents ?? 0,
    repasseTarget: (repasse?.beneficiary_type as PayoutTarget | undefined) ?? null,
    isDemo: r.is_demo,
    createdAt: new Date(r.created_at),
  };
}

const confirmableLeadRow = z.object({ id: z.uuid(), code: z.string(), declared_sale_cents: z.number().int().nullable(), school_name: z.string() });

export async function listConfirmableLeadsForStationery(
  admin: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
): Promise<{ leadId: string; leadCode: string; amountCents: number; schoolNameHint: string }[]> {
  await requireStationeryAccess(admin, actor, stationeryId);
  const { data, error } = await admin
    .from("leads")
    .select("id, code, declared_sale_cents, school_name")
    .eq("stationery_id", stationeryId)
    .eq("status", "converted")
    .not("declared_sale_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail("listar vendas confirmáveis", error);
  const leads = z.array(confirmableLeadRow).parse(data ?? []);
  if (leads.length === 0) return [];
  const ids = leads.map((l) => l.id);
  const { data: already, error: alreadyErr } = await admin.from("sale_payments").select("lead_id").in("lead_id", ids);
  if (alreadyErr) fail("conferir vendas já confirmadas", alreadyErr);
  const done = new Set(z.array(z.object({ lead_id: z.uuid() })).parse(already ?? []).map((r) => r.lead_id));
  return leads
    .filter((l) => !done.has(l.id) && l.declared_sale_cents !== null)
    .map((l) => ({ leadId: l.id, leadCode: l.code, amountCents: l.declared_sale_cents as number, schoolNameHint: l.school_name }));
}

const confirmableAdminRow = confirmableLeadRow.extend({ stationeries: z.object({ trade_name: z.string() }).nullable() });

export async function listConfirmableSalesForAdmin(
  admin: SupabaseClient,
  actor: SessionActor,
): Promise<{ leadId: string; leadCode: string; stationeryName: string; amountCents: number; schoolNameHint: string }[]> {
  requireAdmin(actor);
  const { data, error } = await admin
    .from("leads")
    .select("id, code, declared_sale_cents, school_name, stationeries(trade_name)")
    .eq("status", "converted")
    .not("declared_sale_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail("listar vendas confirmáveis", error);
  const leads = z.array(confirmableAdminRow).parse(data ?? []);
  if (leads.length === 0) return [];
  const ids = leads.map((l) => l.id);
  const { data: already, error: alreadyErr } = await admin.from("sale_payments").select("lead_id").in("lead_id", ids);
  if (alreadyErr) fail("conferir vendas já confirmadas", alreadyErr);
  const done = new Set(z.array(z.object({ lead_id: z.uuid() })).parse(already ?? []).map((r) => r.lead_id));
  return leads
    .filter((l) => !done.has(l.id) && l.declared_sale_cents !== null)
    .map((l) => ({
      leadId: l.id,
      leadCode: l.code,
      stationeryName: l.stationeries?.trade_name ?? "Papelaria",
      amountCents: l.declared_sale_cents as number,
      schoolNameHint: l.school_name,
    }));
}

// ---------------------------------------------------------------------------
// Repasse pendente / lotes
// ---------------------------------------------------------------------------

export async function listPendingRepasses(admin: SupabaseClient, actor: SessionActor): Promise<PendingRepasseView[]> {
  requireAdmin(actor);
  const { data, error } = await admin.from("payout_ledger").select("beneficiary_type, beneficiary_id, amount_cents").in("entry_type", ["repasse_due", "repasse_settled", "repasse_reversed"]);
  if (error) fail("apurar repasse pendente", error);
  const rows = z.array(z.object({ beneficiary_type: z.enum(["school", "apm"]), beneficiary_id: z.uuid(), amount_cents: z.number().int() })).parse(data ?? []);
  const byKey = new Map<string, { beneficiaryType: "school" | "apm"; schoolId: string; pendingCents: number }>();
  for (const r of rows) {
    const key = `${r.beneficiary_type}:${r.beneficiary_id}`;
    const prev = byKey.get(key) ?? { beneficiaryType: r.beneficiary_type, schoolId: r.beneficiary_id, pendingCents: 0 };
    prev.pendingCents += r.amount_cents;
    byKey.set(key, prev);
  }
  const pending = [...byKey.values()].filter((v) => v.pendingCents > 0);
  if (pending.length === 0) return [];
  const schoolIds = [...new Set(pending.map((p) => p.schoolId))];
  const { data: schoolsData, error: schoolsErr } = await admin.from("schools").select("id, name").in("id", schoolIds);
  if (schoolsErr) fail("ler nomes de escola", schoolsErr);
  const names = new Map(z.array(z.object({ id: z.uuid(), name: z.string() })).parse(schoolsData ?? []).map((s) => [s.id, s.name]));
  return pending
    .map((p) => ({ beneficiaryType: p.beneficiaryType, schoolId: p.schoolId, schoolName: names.get(p.schoolId) ?? "Escola", pendingCents: p.pendingCents }))
    .sort((a, b) => b.pendingCents - a.pendingCents);
}

const batchRow = z.object({
  id: z.uuid(),
  beneficiary_type: z.enum(["school", "apm"]),
  school_id: z.uuid(),
  total_cents: z.number().int(),
  status: z.enum(["pending", "executed"]),
  created_at: z.string(),
  executed_at: z.string().nullable(),
  schools: z.object({ name: z.string() }).nullable(),
});

export async function listBatches(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<PayoutBatchView[]> {
  requireAdmin(actor);
  const { data, error } = await admin.from("payout_batches").select("*, schools(name)").order("created_at", { ascending: false }).limit(limit);
  if (error) fail("listar lotes de repasse", error);
  return z.array(batchRow).parse(data ?? []).map((r) => ({
    id: r.id,
    beneficiaryType: r.beneficiary_type,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? "Escola",
    totalCents: r.total_cents,
    status: r.status,
    createdAt: new Date(r.created_at),
    executedAt: r.executed_at ? new Date(r.executed_at) : null,
  }));
}

export async function createBatch(admin: SupabaseClient, actor: SessionActor, input: { schoolId: string; beneficiaryType: "school" | "apm" }): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_batch_create", { p_actor_id: actor.userId, p_school_id: input.schoolId, p_beneficiary_type: input.beneficiaryType });
  if (error) fail("gerar lote de repasse", error);
  return z.uuid().parse(data);
}

export async function markBatchExecuted(admin: SupabaseClient, actor: SessionActor, batchId: string): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_batch_mark_executed", { p_actor_id: actor.userId, p_batch_id: batchId });
  if (error) fail("marcar lote como executado", error);
  return z.uuid().parse(data);
}

// ---------------------------------------------------------------------------
// Inadimplência
// ---------------------------------------------------------------------------

const delinquencyRow = z.object({
  stationery_id: z.uuid(),
  trade_name: z.string(),
  status: z.enum(["em_dia", "atraso", "pausado"]),
  days_overdue: z.number().int(),
  oldest_due_date: z.string().nullable(),
});

export async function listDelinquency(admin: SupabaseClient, actor: SessionActor): Promise<DelinquencyRow[]> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_admin_delinquency_list", { p_actor_id: actor.userId });
  if (error) fail("listar inadimplência", error);
  return z.array(delinquencyRow).parse(data ?? []).map((r) => ({
    stationeryId: r.stationery_id,
    tradeName: r.trade_name,
    status: r.status,
    daysOverdue: r.days_overdue,
    oldestDueDate: r.oldest_due_date,
  }));
}

// ---------------------------------------------------------------------------
// Pap07: desempenho
// ---------------------------------------------------------------------------

const OPENED_STATUSES = ["viewed", "in_progress", "quote_sent", "awaiting_customer", "converted", "declined", "expired", "cancelled"];
const ATTENDED_STATUSES = ["in_progress", "quote_sent", "awaiting_customer", "converted", "declined"];

/** `count: "exact", head: true` só conta no banco (nunca busca linha nenhuma): sem teto silencioso de 500 (revisão de segurança). */
async function countLeads(admin: SupabaseClient, stationeryId: string, statuses?: readonly string[]): Promise<number> {
  let q = admin.from("leads").select("*", { count: "exact", head: true }).eq("stationery_id", stationeryId);
  if (statuses) q = q.in("status", statuses);
  const { count, error } = await q;
  if (error) fail("contar leads para desempenho", error);
  return count ?? 0;
}

export async function getPerformanceSummary(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<PerformanceSummary> {
  await requireStationeryAccess(admin, actor, stationeryId);
  const [sent, opened, attended, sold] = await Promise.all([
    countLeads(admin, stationeryId),
    countLeads(admin, stationeryId, OPENED_STATUSES),
    countLeads(admin, stationeryId, ATTENDED_STATUSES),
    countLeads(admin, stationeryId, ["converted"]),
  ]);
  const funnel = { sent, opened, attended, sold };

  const { data: salesData, error: salesErr } = await admin.from("sale_payments").select("amount_cents").eq("stationery_id", stationeryId).eq("is_demo", false);
  if (salesErr) fail("ler ticket médio", salesErr);
  const amounts = z.array(z.object({ amount_cents: z.number().int() })).parse(salesData ?? []).map((r) => r.amount_cents);
  const ticketAverageCents = amounts.length === 0 ? null : Math.round(amounts.reduce((sum, a) => sum + a, 0) / amounts.length);

  // Declarado × confirmado (regra 2 de 3, S22): só os últimos 100 vendidos (rótulo explícito na tela), para não
  // sobrecarregar (piloto de 1 cidade) — busca própria, independente do funil (que agora só conta, não busca linha).
  const { data: soldData, error: soldErr } = await admin.from("leads").select("id").eq("stationery_id", stationeryId).eq("status", "converted").order("created_at", { ascending: false }).limit(100);
  if (soldErr) fail("ler vendidos para desempenho", soldErr);
  const soldIds = z.array(z.object({ id: z.uuid() })).parse(soldData ?? []).map((r) => r.id);
  let confirmedCount = 0;
  if (soldIds.length > 0) {
    const signals = await Promise.all(
      soldIds.map((id) => admin.rpc("lead_conversion_signals", { p_lead_id: id }).then(({ data: d, error: e }) => (e ? null : z.array(z.object({ confirmed: z.boolean() })).parse(d ?? [])[0]))),
    );
    confirmedCount = signals.filter((s) => s?.confirmed).length;
  }

  return { funnel, ticketAverageCents, declaredCount: soldIds.length, confirmedCount };
}

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

export function createPayoutStore(admin: SupabaseClient): PayoutStore {
  return {
    getActiveSettings: () => getActiveSettings(admin),
    publishSettings: (actor, input) => publishSettings(admin, actor, input),
    listSchoolConfigs: (actor) => listSchoolConfigs(admin, actor),
    publishSchoolConfig: (actor, input) => publishSchoolConfig(admin, actor, input),
    confirmSale: (actor, input) => confirmSale(admin, actor, input),
    getSaleForLead: (actor, leadId) => getSaleForLead(admin, actor, leadId),
    listRecentSalePayments: (actor, limit) => listRecentSalePayments(admin, actor, limit),
    listConfirmableLeadsForStationery: (actor, stationeryId) => listConfirmableLeadsForStationery(admin, actor, stationeryId),
    listConfirmableSalesForAdmin: (actor) => listConfirmableSalesForAdmin(admin, actor),
    listPendingRepasses: (actor) => listPendingRepasses(admin, actor),
    listBatches: (actor, limit) => listBatches(admin, actor, limit),
    createBatch: (actor, input) => createBatch(admin, actor, input),
    markBatchExecuted: (actor, batchId) => markBatchExecuted(admin, actor, batchId),
    listDelinquency: (actor) => listDelinquency(admin, actor),
    listSchoolOptions: (actor) => listSchoolOptions(admin, actor),
    getPerformanceSummary: (actor, stationeryId) => getPerformanceSummary(admin, actor, stationeryId),
  };
}
