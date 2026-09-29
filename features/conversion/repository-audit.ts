import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import { ConversionError } from "./errors";
import type { AuditRow, PurchaseAnswer, SurveyLeadView } from "./ports";
import { fail, fetchSignals, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
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

export async function listSurveyLeadsForParent(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<SurveyLeadView[]> {
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

export async function listAuditRows(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<AuditRow[]> {
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
