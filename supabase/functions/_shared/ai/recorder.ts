import { AiError } from "./errors.ts";
import { type RpcClient, isConfigError, rpcUnavailable } from "./settings.ts";
import type { DecisionRecord, DecisionRecorder } from "./types.ts";

const nonNegativeInt = (v: number | undefined): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Só o que o provedor informou e é inteiro não negativo; o resto fica de fora (o banco grava nulo). */
function usageFields(u: DecisionRecord["usage"]): Record<string, number> {
  if (!u) return {};
  return {
    ...(nonNegativeInt(u.promptTokens) ? { prompt_tokens: u.promptTokens } : {}),
    ...(nonNegativeInt(u.completionTokens) ? { completion_tokens: u.completionTokens } : {}),
    ...(nonNegativeInt(u.totalTokens) ? { total_tokens: u.totalTokens } : {}),
    ...(nonNegativeInt(u.costUsdMicros) ? { provider_cost_usd_micros: u.costUsdMicros } : {}),
  };
}

/** Grava por `ai_record_decision(jsonb)` (whitelist no banco). Só ids, scores, códigos e nomes de modelo. */
export function createRpcRecorder(rpc: RpcClient): DecisionRecorder {
  return {
    async record(d: DecisionRecord) {
      const p_decision = {
        entity_type: d.entityType,
        entity_id: d.entityId,
        kind: d.kind,
        provider: d.provider,
        model: d.model,
        prompt_key: d.promptKey,
        prompt_version: d.promptVersion,
        pipeline_version: d.pipelineVersion,
        overall_score: d.overallScore,
        item_scores: d.itemScores,
        alerts: d.alerts,
        decision: d.decision,
        justification: d.justification,
        attempt: d.attempt,
        started_at: d.startedAt,
        finished_at: d.finishedAt,
        latency_ms: d.latencyMs,
        ...usageFields(d.usage),
      };
      let error: unknown;
      try {
        ({ error } = await rpc.rpc("ai_record_decision", { p_decision }));
      } catch {
        error = true;
      }
      // Só o banco recusar a decisão (P0002/formato) é permanente; falha de RPC repete sem perder o resultado.
      if (error) {
        if (isConfigError(error)) throw new AiError("provider_error", { transient: false, detail: "decision_record_failed" });
        throw rpcUnavailable("decision_record_failed");
      }
    },
  };
}
