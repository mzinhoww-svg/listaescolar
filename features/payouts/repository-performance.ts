import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { PerformanceSummary } from "./ports";
import { fail, requireStationeryAccess } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts. Seção "Pap07: desempenho".

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
