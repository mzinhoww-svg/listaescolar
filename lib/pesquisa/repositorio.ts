import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Espelha as colunas de `survey_responses` (supabase/migrations/0700_pesquisa_maes.sql). */
export type SurveyResponseRow = {
  id: string;
  session_id: string;
  survey_version: string;
  answers: Record<string, unknown>;
  last_step: number;
  source_group: string | null;
  ref_session_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  started_at: string;
  /** Adicionada pela migration 0701 (aditiva), aliás de `started_at` para o guard-rail de schema do repositório. */
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

/** Espelha as colunas de `survey_leads`, mais `source_group` trazido por join com `survey_responses`. */
export type SurveyLeadRow = {
  id: string;
  session_id: string;
  name: string | null;
  whatsapp_e164: string;
  consent_text: string;
  consent_at: string;
  created_at: string;
  /** Adicionada pela migration 0701 (aditiva), para o guard-rail de schema do repositório. */
  updated_at: string;
  source_group: string | null;
};

/** Código do Postgres para violação de foreign key. */
const FOREIGN_KEY_VIOLATION = "23503";

export async function upsertAnswer(params: {
  sessionId: string;
  step: number;
  answers: Record<string, unknown>;
  sourceGroup?: string;
  ref?: string;
  ipHash: string | null;
  userAgent: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("survey_upsert_answer", {
    p_session_id: params.sessionId,
    p_step: params.step,
    p_answers: params.answers,
    p_source_group: params.sourceGroup ?? null,
    p_ref: params.ref ?? null,
    p_ip_hash: params.ipHash,
    p_user_agent: params.userAgent,
  });
  if (error) throw new Error(`survey_upsert_answer falhou: ${error.message}`);
}

export async function sessionExists(sessionId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1);
  if (error) throw new Error(`sessionExists falhou: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function countNewSessionsForIpHash(
  ipHash: string | null,
  sinceIso: string,
): Promise<number> {
  if (!ipHash) return 0;
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("survey_responses")
    .select("session_id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("started_at", sinceIso);
  if (error) throw new Error(`countNewSessionsForIpHash falhou: ${error.message}`);
  return count ?? 0;
}

export async function markCompleted(sessionId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("survey_responses")
    .update({ completed_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("completed_at", null)
    .gte("last_step", 11)
    .select("id");
  if (error) throw new Error(`markCompleted falhou: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function createOrUpdateLead(params: {
  sessionId: string;
  name?: string;
  whatsappE164: string;
  consentText: string;
}): Promise<"ok" | "session_not_found"> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("survey_leads").upsert(
    {
      session_id: params.sessionId,
      name: params.name ?? null,
      whatsapp_e164: params.whatsappE164,
      consent_text: params.consentText,
    },
    { onConflict: "session_id" },
  );
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) return "session_not_found";
    throw new Error(`createOrUpdateLead falhou: ${error.message}`);
  }
  return "ok";
}

export async function exportResponsesRows(): Promise<SurveyResponseRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("survey_responses").select("*");
  if (error) throw new Error(`exportResponsesRows falhou: ${error.message}`);
  return (data ?? []) as SurveyResponseRow[];
}

export async function exportLeadsRows(): Promise<SurveyLeadRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("survey_leads")
    .select("*, survey_responses!inner(source_group)");
  if (error) throw new Error(`exportLeadsRows falhou: ${error.message}`);
  return (data ?? []).map((row) => {
    const { survey_responses, ...rest } = row as unknown as SurveyLeadRow & {
      survey_responses: { source_group: string | null } | { source_group: string | null }[];
    };
    const joined = Array.isArray(survey_responses) ? survey_responses[0] : survey_responses;
    return { ...rest, source_group: joined?.source_group ?? null };
  });
}
