import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Uso agregado (S24, Global Constraints): por (chave, dia America/Cuiaba, endpoint, classe de status), gravado
// depois da resposta via `after()`. Sem IP, user agent, corpo, query ou SKU — só contagens.

export const USAGE_STATUS_CLASSES = ["2xx", "4xx", "429", "5xx"] as const;
export type UsageStatusClass = (typeof USAGE_STATUS_CLASSES)[number];

export function statusClassOf(status: number): UsageStatusClass {
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return "2xx";
}

export type RecordUsageInput = {
  keyId: string;
  endpoint: string;
  statusClass: UsageStatusClass;
  matchTotal?: number;
  matchMatched?: number;
};

/** Chama `b2b_usage_record`. Falha nunca deve mudar a resposta já enviada — o chamador (`handler.ts`) já garante
 * isso rodando esta função dentro de `after()` com `.catch`; aqui só propagamos o erro para quem chamou decidir. */
export async function recordUsage(admin: SupabaseClient, input: RecordUsageInput): Promise<void> {
  const { error } = await admin.rpc("b2b_usage_record", {
    p_key_id: input.keyId,
    p_endpoint: input.endpoint,
    p_status_class: input.statusClass,
    p_match_total: input.matchTotal ?? 0,
    p_match_matched: input.matchMatched ?? 0,
  });
  if (error) throw error;
}
