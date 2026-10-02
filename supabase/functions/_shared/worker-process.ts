// Processamento de uma mensagem (extração + conclusão/retry/morte). Extraído de worker-core.ts (D-057, S18) —
// comportamento idêntico ao original.
import { safeEmit } from "./analytics/capture.ts";
import {
  BUSY_RETRY_SECONDS,
  DEFAULT_NOT_DUE_SECONDS,
  MAX_PAID_ATTEMPTS,
  PIPELINE_ABORT_MARGIN_MS,
  TICK_DEADLINE_MS,
  WORKER_TIMEOUT_MS,
  detectMime,
  nextDelaySeconds,
  sanitizeError,
  type JobOutcome,
  type MessageResult,
  type WorkerDeps,
  type WorkerInput,
} from "./worker-types.ts";

async function runWithTimeout(deps: WorkerDeps, input: WorkerInput & { submissionId: string }): Promise<unknown> {
  const abort = new AbortController();
  const timer = new AbortController();
  const budgetMs = deps.timeoutMs ?? WORKER_TIMEOUT_MS;
  const timeout = deps.clock
    .delay(budgetMs, timer.signal)
    .then((): never => {
      abort.abort();
      throw Object.assign(new Error("timeout do pipeline"), { name: "PipelineTimeout" });
    });
  try {
    const routerBudget = Math.max(1, budgetMs - PIPELINE_ABORT_MARGIN_MS);
    return await Promise.race([deps.pipeline.extract(input, { signal: abort.signal, budgetMs: routerBudget }), timeout]);
  } finally {
    timer.abort();
  }
}

/** Falhas de leitura de settings/prompt ocorrem antes de qualquer chamada paga: não contam no teto. */
const UNPAID_DETAILS = new Set(["settings_unavailable", "prompt_unavailable"]);

function isPermanentAiError(e: unknown, attempts: number): boolean {
  const x = e as { name?: unknown; code?: unknown; transient?: unknown; detail?: unknown } | null;
  // Timeout externo: havia chamada em andamento (possivelmente paga); conta no teto.
  if (x?.name === "PipelineTimeout") return attempts >= MAX_PAID_ATTEMPTS;
  if (!x || x.name !== "AiError") return false;
  if (x.transient === false || x.code === "invalid_output") return true;
  if (typeof x.detail === "string" && UNPAID_DETAILS.has(x.detail)) return false;
  return attempts >= MAX_PAID_ATTEMPTS;
}

export async function processMessage(jobId: string, deps: WorkerDeps): Promise<MessageResult> {
  const claim = await deps.jobs.claim(jobId);
  if (claim === "finished") return { outcome: "skipped", ack: true }; // duplicada, concluída, morta ou removida
  if (claim === "busy") return { outcome: "skipped", ack: false, retryInSeconds: BUSY_RETRY_SECONDS };
  if (claim === "not_due") {
    const due = (await deps.jobs.get(jobId))?.runAfter;
    const wait = due ? Math.ceil((Date.parse(due) - deps.clock.now()) / 1000) : DEFAULT_NOT_DUE_SECONDS;
    return {
      outcome: "skipped",
      ack: false,
      retryInSeconds: Math.max(1, Number.isFinite(wait) ? wait : DEFAULT_NOT_DUE_SECONDS),
    };
  }
  const job = await deps.jobs.get(jobId);
  const attempts = job?.attempts ?? 1;
  const failWith = async (error: string, permanent = false): Promise<MessageResult> => {
    const delay = nextDelaySeconds(attempts, deps.random?.() ?? 0);
    const status = await deps.jobs.fail(jobId, error, delay, permanent, attempts);
    return status === "dead"
      ? { outcome: "dead", ack: true }
      : { outcome: "retry", ack: false, retryInSeconds: delay };
  };

  if (!job?.submissionId) return failWith("job sem envio associado");
  const input = await deps.loadInput(job.submissionId);
  if (!input) return failWith("arquivo do envio indisponível");
  // Revalida o objeto armazenado: o que está no bucket precisa bater com o tipo gravado no envio.
  if (detectMime(input.bytes) !== input.mime) return failWith("invalid_file", true);

  const started = deps.clock.now();
  let result: unknown;
  try {
    result = await runWithTimeout(deps, { ...input, submissionId: job.submissionId });
  } catch (e) {
    // Erro de IA sem chance de sucesso (4xx do provedor, modelo/config ausente, saída inválida depois da escalada)
    // não se repete: cada tentativa é paga. Os transitórios repetem até MAX_PAID_ATTEMPTS.
    return failWith(sanitizeError(e), isPermanentAiError(e, attempts));
  }
  const parsed = deps.resultSchema.safeParse(result);
  if (!parsed.success) return failWith("resultado inválido do pipeline");
  const durationMs = Math.max(0, Math.round(deps.clock.now() - started));
  await deps.jobs.complete(jobId, parsed.data, durationMs, {
    attempts,
    isDemo: deps.pipeline.isDemo === true,
  });
  const read = parsed.data as { items?: unknown[]; lowConfidence?: boolean } | null;
  safeEmit(deps.emit, "ocr_completed", {
    duracao_ms: durationMs,
    fila: "async",
    status: read?.lowConfidence === true ? "low_confidence" : "accepted",
    items_count: Array.isArray(read?.items) ? read.items.length : 0,
    attempts,
  });
  if (deps.decide) {
    try {
      const budgetMs = deps.deadlineAt === undefined ? TICK_DEADLINE_MS : Math.max(0, deps.deadlineAt - deps.clock.now());
      await deps.decide(job.submissionId, { budgetMs });
    } catch (e) {
      try {
        deps.onDecideError?.(e);
      } catch {
        // o log nunca derruba o worker
      }
    }
  }
  return { outcome: "done", ack: true };
}

export async function processJob(jobId: string, deps: WorkerDeps): Promise<JobOutcome> {
  return (await processMessage(jobId, deps)).outcome;
}
