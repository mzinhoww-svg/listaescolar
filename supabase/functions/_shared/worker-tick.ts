// Um ciclo do worker (handleTick). Extraído de worker-core.ts (D-057, S18) — comportamento idêntico ao original.
import { processMessage } from "./worker-process.ts";
import {
  DEFERRED_RETRY_SECONDS,
  MIN_CLAIM_WINDOW_MS,
  MIN_SWEEP_WINDOW_MS,
  TICK_BATCH,
  TICK_DEADLINE_MS,
  WORKER_TIMEOUT_MS,
  sanitizeError,
  type TickError,
  type TickSummary,
  type WorkerDeps,
  type WorkerQueue,
} from "./worker-types.ts";

/**
 * Um ciclo do worker: lê mensagens, processa, confirma ou reprograma. Erro de infraestrutura não confirma e é
 * reportado (sem PII) a `onError`. Prazo total `deadlineMs`: passado o prazo, mensagens já lidas voltam à fila e
 * nada novo é reivindicado; o teto de cada extração também respeita o que resta do prazo.
 */
export async function handleTick(
  queue: WorkerQueue,
  deps: Omit<WorkerDeps, "pipeline"> & { pipeline: WorkerDeps["pipeline"] | null },
  opts: {
    batch?: number;
    vtSeconds?: number;
    deadlineMs?: number;
    onError?: (e: TickError) => void;
    /** Varredor da publicação (S09), no fim do tick, com o prazo restante. Roda também sem pipeline. */
    sweep?: (remainingMs: number) => Promise<unknown>;
  } = {},
): Promise<TickSummary> {
  const summary: TickSummary = { done: 0, retry: 0, dead: 0, skipped: 0, errors: 0, read: 0, deferred: 0 };
  const start = deps.clock.now();
  const deadline = opts.deadlineMs ?? TICK_DEADLINE_MS;
  const report = (stage: TickError["stage"], e: unknown, jobId?: string) => {
    summary.errors += 1;
    try {
      opts.onError?.({ stage, ...(jobId ? { jobId } : {}), message: sanitizeError(e) });
    } catch {
      // o log nunca derruba o tick
    }
  };
  const live = deps.pipeline ? ({ ...deps, pipeline: deps.pipeline } satisfies WorkerDeps) : null;
  if (live) await drainQueue(live);
  // Varredor da publicação: só se sobrou tempo (mínimo 10 s), também sem pipeline configurado.
  const left = deadline - (deps.clock.now() - start);
  if (opts.sweep && left >= MIN_SWEEP_WINDOW_MS) {
    try {
      const swept = await opts.sweep(left);
      if (swept && typeof swept === "object") summary.sweep = swept as Record<string, number>;
    } catch (e) {
      report("sweep", e);
    }
  }
  return summary;

  async function drainQueue(deps: WorkerDeps): Promise<void> {
    try {
      await deps.jobs.requeueStale(); // antes de ler: jobs vencidos voltam à fila
    } catch (e) {
      report("requeue", e); // rede de segurança: falhar não impede de drenar a fila
    }
    const messages = await queue.read(opts.batch ?? TICK_BATCH, opts.vtSeconds ?? 120);
    summary.read = messages.length;
    for (const m of messages) {
      if (!m.jobId) {
        await queue.ack(m.msgId); // mensagem sem job_id: veneno, descarta
        summary.skipped += 1;
        continue;
      }
      const remaining = deadline - (deps.clock.now() - start);
      if (remaining < MIN_CLAIM_WINDOW_MS) {
        summary.deferred += 1;
        try {
          await queue.setVt(m.msgId, DEFERRED_RETRY_SECONDS);
        } catch (e) {
          report("message", e, m.jobId);
        }
        continue;
      }
      try {
        const r = await processMessage(m.jobId, {
          ...deps,
          timeoutMs: Math.min(deps.timeoutMs ?? WORKER_TIMEOUT_MS, remaining),
          deadlineAt: start + deadline,
          onDecideError: (e) => report("decide", e, m.jobId ?? undefined),
        });
        summary[r.outcome] += 1;
        if (r.ack) await queue.ack(m.msgId);
        else if (r.retryInSeconds !== undefined) await queue.setVt(m.msgId, r.retryInSeconds);
      } catch (e) {
        report("message", e, m.jobId); // sem ack: a mensagem volta após o vt
      }
    }
  }
}
