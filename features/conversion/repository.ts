import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { CONVERSION_ERROR_CODES, ConversionError, type ConversionErrorCode } from "./errors";
import type {
  AdminDisputeView,
  AuditRow,
  ConversionSignals,
  ConversionStore,
  DisputeDecision,
  DisputeReason,
  DisputeView,
  LeadDisputeGate,
  PurchaseAnswer,
  ReviewHideReason,
  ReviewTag,
  ReviewView,
  SurveyLeadView,
} from "./ports";

// Escritas: SEMPRE pelas funções SQL da 0402 (service_role, EXECUTE só dele) — o banco confere quem é o ator dentro
// da transação. Leituras: cliente de SERVIÇO com filtro/checagem EXPLÍCITA de posse (mesmo padrão de
// features/leads/repository.ts e features/billing/repository.ts): as funções de leitura aqui não usam RLS (o
// cliente de serviço a ignora), então a posse é conferida em código, com o mesmo predicado das políticas da 0402.

const HINT_CODES: ReadonlySet<string> = new Set<ConversionErrorCode>(CONVERSION_ERROR_CODES.filter((c) => c !== "database"));

function dbErrorCode(error: { code?: string; hint?: string | null }): ConversionErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as ConversionErrorCode;
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

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: ConversionErrorCode): never {
  throw new ConversionError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new ConversionError("ator não vem da sessão", "forbidden");
}

const leadRow = z.object({
  id: z.uuid(),
  code: z.string(),
  requester_id: z.uuid().nullable(),
  stationery_id: z.uuid(),
  status: z.string(),
  school_name: z.string(),
  created_at: z.string(),
});

async function loadLead(admin: SupabaseClient, leadId: string) {
  const { data, error } = await admin
    .from("leads")
    .select("id, code, requester_id, stationery_id, status, school_name, created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (error) fail("ler pedido", error);
  if (!data) throw new ConversionError("pedido não encontrado", "not_found");
  return leadRow.parse(data);
}

async function isStationeryMember(admin: SupabaseClient, stationeryId: string, profileId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("stationery_members")
    .select("profile_id")
    .eq("stationery_id", stationeryId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) fail("conferir posse da papelaria", error);
  return data !== null;
}

/** O ator vê o pedido: é o solicitante, é membro da papelaria dele, ou é admin/system. */
async function requireLeadAccess(admin: SupabaseClient, actor: SessionActor, lead: { requester_id: string | null; stationery_id: string }): Promise<void> {
  requireActor(actor);
  if (actor.role === "admin" || actor.role === "system") return;
  if (lead.requester_id === actor.userId) return;
  if (await isStationeryMember(admin, lead.stationery_id, actor.userId)) return;
  throw new ConversionError("ator sem acesso a este pedido", "forbidden");
}

function toSignals(row: { stationery_confirmed: boolean; parent_confirmed: boolean; pix_confirmed: boolean; signal_count: number; confirmed: boolean }): ConversionSignals {
  return {
    stationeryConfirmed: row.stationery_confirmed,
    parentConfirmed: row.parent_confirmed,
    pixConfirmed: row.pix_confirmed,
    signalCount: row.signal_count,
    confirmed: row.confirmed,
  };
}

const signalsRow = z.object({
  stationery_confirmed: z.boolean(),
  parent_confirmed: z.boolean(),
  pix_confirmed: z.boolean(),
  signal_count: z.number().int(),
  confirmed: z.boolean(),
});

async function fetchSignals(admin: SupabaseClient, leadId: string): Promise<ConversionSignals> {
  const { data, error } = await admin.rpc("lead_conversion_signals", { p_lead_id: leadId }).single();
  if (error) fail("calcular sinais de conversão", error);
  return toSignals(signalsRow.parse(data));
}

// ---------------------------------------------------------------------------
// lead_confirm_purchase (App22)
// ---------------------------------------------------------------------------
async function confirmPurchase(admin: SupabaseClient, actor: SessionActor, leadId: string, answer: PurchaseAnswer): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_confirm_purchase", { p_lead_id: leadId, p_actor_id: actor.userId, p_answer: answer });
  if (error) fail("confirmar compra", error);
  return z.uuid().parse(data);
}

async function getSignals(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<ConversionSignals> {
  const lead = await loadLead(admin, leadId);
  await requireLeadAccess(admin, actor, lead);
  return fetchSignals(admin, leadId);
}

// ---------------------------------------------------------------------------
// lead_review_create (App23) / leitura pública (Pap08)
// ---------------------------------------------------------------------------
async function createReview(
  admin: SupabaseClient,
  actor: SessionActor,
  leadId: string,
  input: { rating: number; tags: ReviewTag[]; comment: string | null },
): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_review_create", {
    p_lead_id: leadId,
    p_actor_id: actor.userId,
    p_rating: input.rating,
    p_tags: input.tags,
    p_comment: input.comment,
  });
  if (error) fail("enviar avaliação", error);
  return z.uuid().parse(data);
}

const reviewRow = z.object({
  id: z.uuid(),
  lead_id: z.uuid(),
  stationery_id: z.uuid(),
  rating: z.number().int(),
  tags: z.array(z.string()),
  comment: z.string().nullable(),
  status: z.enum(["published", "hidden"]),
  is_demo: z.boolean(),
  hidden_reason: z.string().nullable(),
  created_at: z.string(),
});

function toReview(r: z.infer<typeof reviewRow>): ReviewView {
  return {
    id: r.id,
    leadId: r.lead_id,
    stationeryId: r.stationery_id,
    rating: r.rating,
    tags: r.tags,
    comment: r.comment,
    status: r.status,
    isDemo: r.is_demo,
    hiddenReason: r.hidden_reason as ReviewHideReason | null,
    createdAt: new Date(r.created_at),
  };
}

/**
 * Avaliações publicadas da papelaria (Pap08, perfil público): sem exigir ator (dado público). Revisão de segurança:
 * avaliação `is_demo` só aparece se a PRÓPRIA papelaria também for `is_demo` — nunca mostra um "brincadeira" numa
 * papelaria real (o resto do perfil já tem o selo "Demonstração" quando a papelaria é demo; não repete por avaliação).
 */
async function listPublishedReviews(admin: SupabaseClient, stationeryId: string, limit: number): Promise<ReviewView[]> {
  const [reviewsRes, stationeryRes] = await Promise.all([
    admin
      .from("lead_reviews")
      .select("id, lead_id, stationery_id, rating, tags, comment, status, is_demo, hidden_reason, created_at")
      .eq("stationery_id", stationeryId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin.from("stationeries").select("is_demo").eq("id", stationeryId).maybeSingle(),
  ]);
  if (reviewsRes.error) fail("ler avaliações", reviewsRes.error);
  if (stationeryRes.error) fail("ler papelaria", stationeryRes.error);
  const stationeryIsDemo = z.object({ is_demo: z.boolean() }).nullable().parse(stationeryRes.data)?.is_demo ?? false;
  return z
    .array(reviewRow)
    .parse(reviewsRes.data ?? [])
    .filter((r) => stationeryIsDemo || !r.is_demo)
    .map(toReview);
}

/** Avaliações recentes para moderação (admin, todas as papelarias, publicadas e ocultas). */
async function listRecentReviewsForAdmin(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<ReviewView[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe modera avaliações", "forbidden");
  const { data, error } = await admin
    .from("lead_reviews")
    .select("id, lead_id, stationery_id, rating, tags, comment, status, is_demo, hidden_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar avaliações para moderação", error);
  return z.array(reviewRow).parse(data ?? []).map(toReview);
}

/** `lead_review_hide`: só admin, motivo de lista fechada (nunca texto livre do moderador). Idempotente. */
async function hideReview(admin: SupabaseClient, actor: SessionActor, reviewId: string, reason: ReviewHideReason): Promise<string> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe modera avaliações", "forbidden");
  const { data, error } = await admin.rpc("lead_review_hide", { p_review_id: reviewId, p_actor_id: actor.userId, p_reason: reason });
  if (error) fail("ocultar avaliação", error);
  return z.uuid().parse(data);
}

// ---------------------------------------------------------------------------
// lead_disputes (Pap03 contestar, Admin12)
// ---------------------------------------------------------------------------
const disputeRow = z.object({
  id: z.uuid(),
  lead_id: z.uuid(),
  stationery_id: z.uuid(),
  reason: z.string(),
  detail: z.string().nullable(),
  status: z.enum(["open", "accepted", "rejected"]),
  deadline_at: z.string(),
  resolved_at: z.string().nullable(),
  resolution_reason: z.string().nullable(),
  reversed_entry_id: z.uuid().nullable(),
  created_at: z.string(),
});

function toDispute(r: z.infer<typeof disputeRow>, leadCode: string): DisputeView {
  return {
    id: r.id,
    leadId: r.lead_id,
    leadCode,
    stationeryId: r.stationery_id,
    reason: r.reason as DisputeReason,
    detail: r.detail,
    status: r.status,
    deadlineAt: new Date(r.deadline_at),
    resolvedAt: r.resolved_at === null ? null : new Date(r.resolved_at),
    resolutionReason: r.resolution_reason,
    reversedEntryId: r.reversed_entry_id,
    createdAt: new Date(r.created_at),
  };
}

async function openDispute(admin: SupabaseClient, actor: SessionActor, leadId: string, reason: DisputeReason, detail: string | null): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_dispute_open", { p_lead_id: leadId, p_actor_id: actor.userId, p_reason: reason, p_detail: detail });
  if (error) fail("abrir contestação", error);
  return z.uuid().parse(data);
}

async function resolveDispute(admin: SupabaseClient, actor: SessionActor, disputeId: string, decision: DisputeDecision, reason: string | null): Promise<string> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe resolve contestações", "forbidden");
  const { data, error } = await admin.rpc("lead_dispute_resolve", {
    p_dispute_id: disputeId,
    p_actor_id: actor.userId,
    p_actor_role: "admin",
    p_decision: decision,
    p_resolution_reason: reason,
  });
  if (error) fail("resolver contestação", error);
  return z.uuid().parse(data);
}

/**
 * Estado da contestação para o Pap03: prazo, se ainda pode contestar (com o motivo do bloqueio, quando houver) e a
 * disputa existente. Espelha as regras da 0402 (`lead_dispute_open`) só para EXIBIÇÃO — o banco é a fonte final.
 */
async function getDisputeGate(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<LeadDisputeGate> {
  const lead = await loadLead(admin, leadId);
  await requireLeadAccess(admin, actor, lead);
  const deadlineAt = new Date(new Date(lead.created_at).getTime() + 72 * 60 * 60 * 1000);
  const [disputeRes, confirmationRes, stationeryRes] = await Promise.all([
    admin
      .from("lead_disputes")
      .select("id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, reversed_entry_id, created_at")
      .eq("lead_id", leadId)
      .maybeSingle(),
    admin.from("lead_purchase_confirmations").select("answer").eq("lead_id", leadId).maybeSingle(),
    admin.from("stationeries").select("status").eq("id", lead.stationery_id).maybeSingle(),
  ]);
  if (disputeRes.error) fail("ler contestação", disputeRes.error);
  if (confirmationRes.error) fail("ler confirmação de compra", confirmationRes.error);
  if (stationeryRes.error) fail("ler papelaria", stationeryRes.error);
  let existingDispute = disputeRes.data ? toDispute(disputeRow.parse(disputeRes.data), lead.code) : null;
  // revisão de segurança: o solicitante (pai) do lead nunca lê o `detail` (texto livre) que a papelaria escreveu ao
  // contestar — só a própria papelaria e o admin.
  const isRequester = actor.role !== "admin" && actor.role !== "system" && lead.requester_id === actor.userId;
  if (existingDispute && isRequester) existingDispute = { ...existingDispute, detail: null };

  const boughtHere = z.object({ answer: z.string() }).nullable().parse(confirmationRes.data)?.answer === "bought_here";
  const sold = lead.status === "converted" || boughtHere;
  const suspended = z.object({ status: z.string() }).nullable().parse(stationeryRes.data)?.status === "suspended";
  const expired = Date.now() > deadlineAt.getTime();
  const blockedReason: LeadDisputeGate["blockedReason"] = existingDispute ? null : sold ? "sold" : suspended ? "suspended" : expired ? "expired" : null;
  return {
    leadId,
    stationeryId: lead.stationery_id,
    deadlineAt,
    canDispute: existingDispute === null && blockedReason === null,
    blockedReason,
    existingDispute,
  };
}

async function listDisputesForStationery(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<DisputeView[]> {
  requireActor(actor);
  if (actor.role !== "admin" && !(await isStationeryMember(admin, stationeryId, actor.userId))) {
    throw new ConversionError("ator não é membro desta papelaria", "forbidden");
  }
  const { data, error } = await admin
    .from("lead_disputes")
    .select("id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, reversed_entry_id, created_at, leads(code)")
    .eq("stationery_id", stationeryId)
    .order("created_at", { ascending: false });
  if (error) fail("listar contestações", error);
  return z
    .array(disputeRow.extend({ leads: z.object({ code: z.string() }).nullable() }))
    .parse(data ?? [])
    .map((r) => toDispute(r, r.leads?.code ?? ""));
}

/** Enriquece disputas com o status do lead e os 3 sinais — o admin vê isso ANTES de aceitar/rejeitar (revisão de segurança). */
async function toAdminDisputeViews(admin: SupabaseClient, rows: readonly (z.infer<typeof disputeRow> & { leads: { code: string; status: string } | null })[]): Promise<AdminDisputeView[]> {
  return Promise.all(
    rows.map(async (r) => {
      const dispute = toDispute(r, r.leads?.code ?? "");
      const signals = await fetchSignals(admin, r.lead_id);
      return { ...dispute, leadStatus: r.leads?.status ?? "indisponível", signals };
    }),
  );
}

async function listOpenDisputesForAdmin(admin: SupabaseClient, actor: SessionActor): Promise<AdminDisputeView[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe vê a fila de contestações", "forbidden");
  const { data, error } = await admin
    .from("lead_disputes")
    .select("id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, reversed_entry_id, created_at, leads(code, status)")
    .eq("status", "open")
    .order("deadline_at", { ascending: true });
  if (error) fail("listar contestações abertas", error);
  const rows = z.array(disputeRow.extend({ leads: z.object({ code: z.string(), status: z.string() }).nullable() })).parse(data ?? []);
  return toAdminDisputeViews(admin, rows);
}

async function listResolvedDisputesForAdmin(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<AdminDisputeView[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe vê o histórico de contestações", "forbidden");
  const { data, error } = await admin
    .from("lead_disputes")
    .select("id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, reversed_entry_id, created_at, leads(code, status)")
    .neq("status", "open")
    .order("resolved_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar contestações resolvidas", error);
  const rows = z.array(disputeRow.extend({ leads: z.object({ code: z.string(), status: z.string() }).nullable() })).parse(data ?? []);
  return toAdminDisputeViews(admin, rows);
}

// ---------------------------------------------------------------------------
// App22: leads do pai elegíveis para "Você comprou?" / avaliação
// ---------------------------------------------------------------------------
const surveyLeadRow = z.object({
  id: z.uuid(),
  code: z.string(),
  stationery_id: z.uuid(),
  school_name: z.string(),
  status: z.string(),
  created_at: z.string(),
  stationeries: z.object({ trade_name: z.string() }).nullable(),
});

async function listSurveyLeadsForParent(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<SurveyLeadView[]> {
  requireActor(actor);
  const { data, error } = await admin
    .from("leads")
    .select("id, code, stationery_id, school_name, status, created_at, stationeries(trade_name)")
    .eq("requester_id", actor.userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar pedidos", error);
  const leads = z.array(surveyLeadRow).parse(data ?? []);
  if (leads.length === 0) return [];
  const ids = leads.map((l) => l.id);
  const [confirmations, reviews] = await Promise.all([
    admin.from("lead_purchase_confirmations").select("lead_id, answer").in("lead_id", ids),
    admin.from("lead_reviews").select("lead_id").in("lead_id", ids),
  ]);
  if (confirmations.error) fail("ler confirmações", confirmations.error);
  if (reviews.error) fail("ler avaliações", reviews.error);
  const answerByLead = new Map(z.array(z.object({ lead_id: z.uuid(), answer: z.string() })).parse(confirmations.data ?? []).map((r) => [r.lead_id, r.answer as PurchaseAnswer]));
  const reviewedLeads = new Set(z.array(z.object({ lead_id: z.uuid() })).parse(reviews.data ?? []).map((r) => r.lead_id));
  return leads.map((l) => {
    const existingAnswer = answerByLead.get(l.id) ?? null;
    const alreadyReviewed = reviewedLeads.has(l.id);
    const canReview = !alreadyReviewed && (existingAnswer === "bought_here" || l.status === "converted");
    return {
      leadId: l.id,
      code: l.code,
      stationeryId: l.stationery_id,
      stationeryName: l.stationeries?.trade_name ?? "Papelaria",
      schoolName: l.school_name,
      status: l.status,
      createdAt: new Date(l.created_at),
      existingAnswer,
      canReview,
      alreadyReviewed,
    };
  });
}

// ---------------------------------------------------------------------------
// Admin11: auditoria de conversão (declarado x confirmado)
// ---------------------------------------------------------------------------
const auditLeadRow = z.object({
  id: z.uuid(),
  code: z.string(),
  stationery_id: z.uuid(),
  status: z.string(),
  created_at: z.string(),
  stationeries: z.object({ trade_name: z.string() }).nullable(),
});

async function listAuditRows(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<AuditRow[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe vê a auditoria de conversão", "forbidden");
  const { data, error } = await admin
    .from("leads")
    .select("id, code, stationery_id, status, created_at, stationeries(trade_name)")
    .in("status", ["converted", "declined", "quote_sent", "awaiting_customer"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar leads para auditoria", error);
  const leads = z.array(auditLeadRow).parse(data ?? []);
  const rows = await Promise.all(
    leads.map(async (l) => {
      const signals = await fetchSignals(admin, l.id);
      const declaredConverted = l.status === "converted";
      return {
        leadId: l.id,
        code: l.code,
        stationeryId: l.stationery_id,
        stationeryName: l.stationeries?.trade_name ?? "Papelaria",
        createdAt: new Date(l.created_at),
        signals,
        declaredConverted,
        divergent: declaredConverted !== signals.confirmed,
      };
    }),
  );
  return rows;
}

export function createConversionStore(admin: SupabaseClient): ConversionStore {
  return {
    confirmPurchase: (actor, leadId, answer) => confirmPurchase(admin, actor, leadId, answer),
    getSignals: (actor, leadId) => getSignals(admin, actor, leadId),
    createReview: (actor, leadId, input) => createReview(admin, actor, leadId, input),
    listPublishedReviews: (stationeryId, limit) => listPublishedReviews(admin, stationeryId, limit),
    listRecentReviewsForAdmin: (actor, limit) => listRecentReviewsForAdmin(admin, actor, limit),
    hideReview: (actor, reviewId, reason) => hideReview(admin, actor, reviewId, reason),
    openDispute: (actor, leadId, reason, detail) => openDispute(admin, actor, leadId, reason, detail),
    resolveDispute: (actor, disputeId, decision, reason) => resolveDispute(admin, actor, disputeId, decision, reason),
    getDisputeGate: (actor, leadId) => getDisputeGate(admin, actor, leadId),
    listDisputesForStationery: (actor, stationeryId) => listDisputesForStationery(admin, actor, stationeryId),
    listOpenDisputesForAdmin: (actor) => listOpenDisputesForAdmin(admin, actor),
    listResolvedDisputesForAdmin: (actor, limit) => listResolvedDisputesForAdmin(admin, actor, limit),
    listSurveyLeadsForParent: (actor, limit) => listSurveyLeadsForParent(admin, actor, limit),
    listAuditRows: (actor, limit) => listAuditRows(admin, actor, limit),
  };
}
