import "server-only";

import type { ExtractionPipeline } from "../submissions/ports";
import { SYNC_BUDGET_MS } from "../submissions/constants";
import {
  aiPipelineAvailable,
  createAiPipeline,
  type AiEnv,
} from "../../supabase/functions/_shared/ai/composition";
import type { RpcClient } from "../../supabase/functions/_shared/ai/settings";
import { createServiceAiRpc } from "./supabase-rpc";

/**
 * Pipeline real do envio síncrono (orçamento de 10 s), ou `null` se não há provedor configurado (a tela diz
 * "leitura automática indisponível"). `rpc`/`env` são injetáveis nos testes.
 */
export function getRealExtractionPipeline(
  o: { env?: AiEnv; rpc?: RpcClient } = {},
): ExtractionPipeline | null {
  const env = o.env ?? (process.env as AiEnv);
  if (!aiPipelineAvailable(env)) return null;
  return createAiPipeline({ env, rpc: o.rpc ?? createServiceAiRpc(), budgetMs: SYNC_BUDGET_MS });
}
