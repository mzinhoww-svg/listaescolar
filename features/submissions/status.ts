import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { publicationIsDemo } from "@/features/publication";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Quem publicou (D-071), pelas linhas de decisão: `publication:published` = automática; `review:published` = humana.
 * Vale a decisão `published` mais recente (created_at desc). Só é chamada depois de a RLS confirmar que o envio é do usuário. Falha = `null` (texto neutro "Lista publicada").
 */
export async function publishedByOf(id: string): Promise<"auto" | "human" | null> {
  try {
    const { data } = await createAdminClient().from("ai_decisions").select("kind").eq("entity_id", id).eq("decision", "published").in("kind", ["publication", "review"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data?.kind === "publication" ? "auto" : data?.kind === "review" ? "human" : null;
  } catch {
    return null;
  }
}

/**
 * Status do envio com o cliente DO USUÁRIO: a RLS só devolve o envio ao dono e ao admin.
 * `null` = não existe OU é de outra pessoa (o chamador responde 404 nos dois casos).
 */
export async function getSubmissionStatus(supabase: SupabaseClient, id: string): Promise<StatusPayload | null> {
  const sub = await supabase.from("list_submissions").select("id, status, is_demo, source").eq("id", id).maybeSingle();
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
  const source = sub.data.source === "parent" || sub.data.source === "school" ? sub.data.source : null;
  const publishedBy = sub.data.status === "published" ? await publishedByOf(id) : null;
  return {
    status: String(sub.data.status),
    jobStatus: job.data ? String(job.data.status) : null,
    attempts: job.data ? Number(job.data.attempts) : 0,
    notifyChannel: job.data ? String(job.data.notify_channel) : null,
    isDemo: sub.data.is_demo === true,
    pipelineAvailable: isPipelineAvailable(),
    publicationDemo: publicationIsDemo({ NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV, VERCEL_ENV: process.env.VERCEL_ENV, FAKE_PUBLICATION_FIXTURE: process.env.FAKE_PUBLICATION_FIXTURE }),
    ...(source ? { source } : {}),
    ...(publishedBy ? { publishedBy } : {}),
    ...(result.success ? { result: result.data } : {}),
  };
}
