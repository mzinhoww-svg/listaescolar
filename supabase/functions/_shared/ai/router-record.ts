// Gravação da decisão do roteador (ai_decisions), extraída de router.ts (D-057, S18, arquivo com 261 linhas) —
// comportamento idêntico ao original.
import type { AiSettings, DecisionRecord, Prompt, ProviderName, Route } from "./types.ts";
import type { Evaluation, RouterDeps, Task } from "./router.ts";

export const unit = (n: number): number => (Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : 0);

// Códigos de alerta do SPEC (seção de alertas). Qualquer outro código é descartado antes de gravar.
export const ALERT_CODES: ReadonlySet<string> = new Set([
  "low_confidence_item",
  "ambiguous_item",
  "handwritten",
  "possible_collective_item",
  "restrictive_brand_or_spec",
  "text_document_mismatch",
  "invalid_school_grade_year",
]);

export type RecordBase<T> = {
  deps: RouterDeps;
  task: Task<T>;
  settings: AiSettings;
  prompt: Prompt;
  provider: { model: string };
  route: Route;
  cfgProvider: ProviderName;
  attempt: number;
  startedAt: number;
  finishedAt: number;
};

export async function record<T>(b: RecordBase<T>, decision: DecisionRecord["decision"], justification: string, ev?: Evaluation) {
  const iso = (ms: number) => new Date(ms).toISOString();
  await b.deps.recorder.record({
    entityType: b.task.entityType,
    entityId: b.task.entityId,
    kind: "extraction",
    provider: b.cfgProvider,
    model: b.provider.model,
    promptKey: b.prompt.key,
    promptVersion: b.prompt.version,
    pipelineVersion: b.settings.pipelineVersion,
    overallScore: ev ? unit(ev.overall) : null,
    itemScores: ev ? ev.items.slice(0, 2000).map(unit) : [],
    alerts: ev ? ev.alerts.filter((a) => ALERT_CODES.has(a)).slice(0, 200) : [],
    decision,
    justification,
    attempt: b.attempt,
    startedAt: iso(b.startedAt),
    finishedAt: iso(b.finishedAt),
    latencyMs: Math.max(0, Math.round(b.finishedAt - b.startedAt)),
  });
}
