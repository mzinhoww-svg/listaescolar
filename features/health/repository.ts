import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Jobs em `dead` agora (S07/S09: falha definitiva do pipeline, sem retentativa). */
export async function countDeadJobs(client: SupabaseClient): Promise<number> {
  const { count, error } = await client.from("jobs").select("id", { count: "exact", head: true }).eq("status", "dead");
  if (error) throw error;
  return count ?? 0;
}

/** Decisões de IA (S08/S09) nas últimas `windowHours` horas: total e quantas terminaram `failed`. */
export async function aiDecisionStats(client: SupabaseClient, windowHours = 24): Promise<{ total: number; failed: number }> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { count: total, error: totalError } = await client
    .from("ai_decisions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (totalError) throw totalError;
  const { count: failed, error: failedError } = await client
    .from("ai_decisions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("decision", "failed");
  if (failedError) throw failedError;
  return { total: total ?? 0, failed: failed ?? 0 };
}

/** Notifica os admins pela central (S11); sem dado pessoal (`alert_kind`/`alert_count` só). */
export async function notifyAdmins(client: SupabaseClient, kind: "dead_jobs" | "ai_error_rate", count: number): Promise<number> {
  const { data, error } = await client.rpc("system_alert_notify", { p_kind: kind, p_count: count });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
