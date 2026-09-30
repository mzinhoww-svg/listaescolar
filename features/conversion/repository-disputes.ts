import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import { ConversionError } from "./errors";
import type { AdminDisputeView, DisputeDecision, DisputeReason, DisputeView, LeadDisputeGate } from "./ports";
import { fail, fetchSignals, isStationeryMember, loadLead, requireActor, requireLeadAccess } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
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

export async function openDispute(admin: SupabaseClient, actor: SessionActor, leadId: string, reason: DisputeReason, detail: string | null): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_dispute_open", { p_lead_id: leadId, p_actor_id: actor.userId, p_reason: reason, p_detail: detail });
  if (error) fail("abrir contestação", error);
  return z.uuid().parse(data);
}

export async function resolveDispute(admin: SupabaseClient, actor: SessionActor, disputeId: string, decision: DisputeDecision, reason: string | null): Promise<string> {
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
export async function getDisputeGate(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<LeadDisputeGate> {
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

export async function listDisputesForStationery(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<DisputeView[]> {
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
async function toAdminDisputeViews(admin: SupabaseClient, rows: readonly (z.infer<typeof disputeRow> & { leads: { code: string; status: string } | null; stationeries: { trade_name: string } | null })[]): Promise<AdminDisputeView[]> {
  return Promise.all(
    rows.map(async (r) => {
      const dispute = toDispute(r, r.leads?.code ?? "");
      const signals = await fetchSignals(admin, r.lead_id);
      return { ...dispute, leadStatus: r.leads?.status ?? "indisponível", signals, stationeryName: r.stationeries?.trade_name ?? "indisponível" };
    }),
  );
}

export async function listOpenDisputesForAdmin(admin: SupabaseClient, actor: SessionActor): Promise<AdminDisputeView[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe vê a fila de contestações", "forbidden");
  const { data, error } = await admin
    .from("lead_disputes")
    .select("id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, reversed_entry_id, created_at, leads(code, status), stationeries(trade_name)")
    .eq("status", "open")
    .order("deadline_at", { ascending: true });
  if (error) fail("listar contestações abertas", error);
  const rows = z.array(disputeRow.extend({ leads: z.object({ code: z.string(), status: z.string() }).nullable(), stationeries: z.object({ trade_name: z.string() }).nullable() })).parse(data ?? []);
  return toAdminDisputeViews(admin, rows);
}

export async function listResolvedDisputesForAdmin(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<AdminDisputeView[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe vê o histórico de contestações", "forbidden");
  const { data, error } = await admin
    .from("lead_disputes")
    .select("id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, reversed_entry_id, created_at, leads(code, status), stationeries(trade_name)")
    .neq("status", "open")
    .order("resolved_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar contestações resolvidas", error);
  const rows = z.array(disputeRow.extend({ leads: z.object({ code: z.string(), status: z.string() }).nullable(), stationeries: z.object({ trade_name: z.string() }).nullable() })).parse(data ?? []);
  return toAdminDisputeViews(admin, rows);
}
