import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getExtractionPipeline } from "./pipeline-factory";
import { extractionResultSchema } from "./schemas";
import type { StatusPayload } from "./status-model";

/** Falha de configuração (ex.: demonstração em produção) nunca derruba o status: conta como indisponível. */
export function isPipelineAvailable(): boolean {
  try {
    return getExtractionPipeline() !== null;
  } catch {
    return false;
  }
}

/**
 * Status do envio com o cliente DO USUÁRIO: a RLS só devolve o envio ao dono e ao admin.
 * `null` = não existe OU é de outra pessoa (o chamador responde 404 nos dois casos).
 */
export async function getSubmissionStatus(supabase: SupabaseClient, id: string): Promise<StatusPayload | null> {
  const sub = await supabase.from("list_submissions").select("id, status, is_demo").eq("id", id).maybeSingle();
  if (sub.error || !sub.data) return null;
  const job = await supabase
    .from("jobs")
    .select("id, status, attempts, notify_channel")
    .eq("submission_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ocr = await supabase
    .from("ocr_jobs")
    .select("result")
    .eq("submission_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const result = extractionResultSchema.safeParse(ocr.data?.result);
  return {
    status: String(sub.data.status),
    jobStatus: job.data ? String(job.data.status) : null,
    attempts: job.data ? Number(job.data.attempts) : 0,
    notifyChannel: job.data ? String(job.data.notify_channel) : null,
    isDemo: sub.data.is_demo === true,
    pipelineAvailable: isPipelineAvailable(),
    ...(result.success ? { result: result.data } : {}),
  };
}
