// Núcleo do worker do OCR. Sem APIs do Deno nem imports: roda na Edge Function e no Vitest.
// Semântica: at-least-once na fila, efeito único no banco (jobs_claim/jobs_complete são idempotentes).

export type JobOutcome = "done" | "retry" | "dead" | "skipped";

export type WorkerJobRow = {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  submissionId: string | null;
  /** ISO; quando `retrying`/`queued` só pode rodar depois disto. */
  runAfter?: string | null;
};

/** Resultado de jobs_claim: `claimed` (processe), `finished` (ack), `busy`/`not_due` (não confirme; reagende). */
export type ClaimResult = "claimed" | "busy" | "not_due" | "finished";

export type WorkerInput = {
  bytes: Uint8Array;
  mime: string;
  fileName: string;
  grade?: string;
  schoolYear?: number;
};

export interface WorkerJobs {
  get(jobId: string): Promise<WorkerJobRow | null>;
  claim(jobId: string): Promise<ClaimResult>;
  /**
   * `attempts` é o token de fencing (a tentativa reivindicada): um worker antigo, cuja lease venceu e cujo job
   * foi reivindicado por outro, não conclui nem falha o job do novo. `isDemo`: resultado do pipeline demo.
   */
  complete(jobId: string, result: unknown, durationMs: number, fence: { attempts: number; isDemo: boolean }): Promise<void>;
  /**
   * Devolve o novo status do job (`retrying` ou `dead`). `permanent`: falha sem chance de sucesso
   * (ex.: arquivo armazenado inválido); vai direto a `dead`. `attempts`: token de fencing (ver `complete`).
   */
  fail(jobId: string, error: string, retryInSeconds: number, permanent?: boolean, attempts?: number): Promise<string>;
  /** Re-envia à fila mensagens de jobs vencidos (lease expirado, retry devido) e mata os sem tentativas. */
  requeueStale(): Promise<void>;
}

export interface WorkerQueue {
  read(qty: number, vtSeconds: number): Promise<{ msgId: number; readCount: number; jobId: string | null }[]>;
  ack(msgId: number): Promise<void>;
  setVt(msgId: number, vtSeconds: number): Promise<void>;
}

/** Validador da saída do pipeline (o `extractionResultSchema` do Zod, de _shared/extraction-schema.ts). */
export interface ResultSchema {
  safeParse(value: unknown): { success: true; data: unknown } | { success: false };
}

export type WorkerDeps = {
  jobs: WorkerJobs;
  pipeline: {
    /** Pipeline de demonstração: o envio fica marcado `is_demo` ao concluir. */
    isDemo?: boolean;
    /** `submissionId`: `entity_id` das decisões de IA. `budgetMs`: teto desta extração (min(90 s, prazo do tick)). */
    extract(input: WorkerInput & { submissionId: string }, opts: { signal: AbortSignal; budgetMs: number }): Promise<unknown>;
  };
  /** A saída do pipeline SEMPRE passa por aqui antes de `jobs.complete`; inválida = falha (retry). */
  resultSchema: ResultSchema;
  loadInput(submissionId: string): Promise<WorkerInput | null>;
  clock: { now(): number; delay(ms: number, signal?: AbortSignal): Promise<void> };
  /** Teto de uma extração no worker. */
  timeoutMs?: number;
  /** [0,1): jitter do backoff; padrão 0 (determinístico). */
  random?: () => number;
  /**
   * Decisão de publicação (S09): chamada com o id do envio DEPOIS de `jobs.complete`. Nunca muda o resultado do job:
   * a exceção vai a `onDecideError` (o tick a reporta, sanitizada) e o varredor cobre.
   */
  decide?: (submissionId: string, opts: { budgetMs: number }) => Promise<unknown>;
  /** Instante (relógio do worker) em que o tick acaba; `decide` recebe o que resta como `budgetMs`. */
  deadlineAt?: number;
  onDecideError?: (e: unknown) => void;
};

export const BACKOFF_BASE_SECONDS = 30;
export const BACKOFF_FACTOR = 2;
export const BACKOFF_CAP_SECONDS = 15 * 60;
export const BACKOFF_MAX_JITTER = 0.2;
/** Tempo máximo de uma extração no worker. Tem de ficar abaixo da lease de `running` do banco (5 min). */
export const WORKER_TIMEOUT_MS = 90_000;
/**
 * Margem entre o orçamento do roteador e o timer de fora (Server Action e worker): o roteador recebe
 * `orçamento - margem`, fecha a tentativa e grava `provider_timeout` ANTES de o abort externo (que não grava decisão)
 * disparar. Cobre o `settings.load()` e a gravação da decisão, que consomem tempo antes/depois do relógio do roteador.
 */
export const PIPELINE_ABORT_MARGIN_MS = 500;
/** Teto de tentativas (todas pagas) de um job com erro de IA transitório: depois disso o job morre em vez de repetir. */
export const MAX_PAID_ATTEMPTS = 3;
export const BUSY_RETRY_SECONDS = 60;
export const DEFAULT_NOT_DUE_SECONDS = 30;
/** Prazo total de um tick (a Edge Function tem limite de parede): depois dele, nenhuma mensagem nova é reivindicada. */
export const TICK_DEADLINE_MS = 100_000;
/** Lote padrão: pequeno, pois uma extração pode levar até WORKER_TIMEOUT_MS. */
export const TICK_BATCH = 3;
/** Não reivindica mensagem se restam menos que isto do prazo do tick. */
export const MIN_CLAIM_WINDOW_MS = 15_000;
/** Mensagem lida mas não processada por falta de prazo volta à fila em poucos segundos. */
export const DEFERRED_RETRY_SECONDS = 5;
/** O varredor da publicação só roda se restam pelo menos isto do prazo do tick (cabe um envio do varredor). */
export const MIN_SWEEP_WINDOW_MS = 10_000;

/**
 * Atraso antes da próxima tentativa (`attempt` é 1 para a primeira falha): 30, 60, 120, 240, 480, 900 (teto).
 * `jitter` em [0,1) soma até 20%, sem ultrapassar o teto.
 */
export function nextDelaySeconds(attempt: number, jitter = 0): number {
  const n = Math.max(1, Math.floor(attempt));
  const base = Math.min(BACKOFF_BASE_SECONDS * BACKOFF_FACTOR ** (n - 1), BACKOFF_CAP_SECONDS);
  const j = Math.min(Math.max(jitter, 0), 0.999999);
  return Math.min(Math.round(base * (1 + BACKOFF_MAX_JITTER * j)), BACKOFF_CAP_SECONDS);
}

/**
 * Mensagem de erro para `jobs.last_error` e logs: sem PII nem segredo. Controle primeiro, depois e-mail, JWT,
 * Bearer, URL com query, chaves longas e números longos; truncada em 300.
 */
export function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [token]")
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[chave]")
    .replace(/\d{6,}/g, "[num]")
    .slice(0, 300);
}

export type MessageResult = {
  outcome: JobOutcome;
  /** Confirmar (arquivar) a mensagem? Falso em `retry` e enquanto outro worker está no job. */
  ack: boolean;
  /** Novo visibility timeout (retry). */
  retryInSeconds?: number;
};

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Tipo pelo conteúdo (magic bytes); fonte única, usada também por features/submissions/file-validation. */
export function detectMime(
  b: Uint8Array,
): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic" | null {
  if (ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (ascii(b, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(b, 8, 12))) return "image/heic";
  return null;
}

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
  await deps.jobs.complete(jobId, parsed.data, Math.max(0, Math.round(deps.clock.now() - started)), {
    attempts,
    isDemo: deps.pipeline.isDemo === true,
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

export type TickSummary = Record<JobOutcome, number> & {
  errors: number;
  read: number;
  deferred: number;
  /** Resumo do varredor da publicação (contagens), quando rodou. */
  sweep?: Record<string, number>;
};
export type TickError = { stage: "requeue" | "read" | "message" | "decide" | "sweep"; jobId?: string; message: string };

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

// --- adaptadores sobre RPC do Supabase (as funções public.jobs_* da migration 0201) -------------------------

export type RpcFn = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function call(rpc: RpcFn, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

export function createRpcWorkerJobs(rpc: RpcFn, get: WorkerJobs["get"]): WorkerJobs {
  return {
    get,
    claim: async (jobId) => {
      const r = await call(rpc, "jobs_claim", { p_job_id: jobId });
      return r === "claimed" || r === "busy" || r === "not_due" || r === "finished" ? r : "busy";
    },
    complete: async (jobId, result, durationMs, fence) => {
      await call(rpc, "jobs_complete", {
        p_job_id: jobId,
        p_result: result,
        p_duration_ms: durationMs,
        p_attempts: fence.attempts,
        p_is_demo: fence.isDemo,
      });
    },
    fail: async (jobId, error, retryInSeconds, permanent = false, attempts) =>
      String(
        await call(rpc, "jobs_fail", {
          p_job_id: jobId,
          p_error: error,
          p_retry_in_seconds: retryInSeconds,
          p_permanent: permanent,
          p_attempts: attempts ?? null,
        }),
      ),
    requeueStale: async () => {
      await call(rpc, "jobs_requeue_stale");
    },
  };
}

export function createRpcWorkerQueue(rpc: RpcFn): WorkerQueue {
  return {
    read: async (qty, vt) => {
      const rows = (await call(rpc, "jobs_read", { p_qty: qty, p_vt: vt })) as
        | { msg_id: number | string; read_ct: number; job_id: string | null }[]
        | null;
      return (rows ?? []).map((r) => ({ msgId: Number(r.msg_id), readCount: r.read_ct, jobId: r.job_id }));
    },
    ack: async (msgId) => {
      await call(rpc, "jobs_ack", { p_msg_id: msgId });
    },
    setVt: async (msgId, vt) => {
      await call(rpc, "jobs_set_vt", { p_msg_id: msgId, p_vt: vt });
    },
  };
}

/** Linha da tabela jobs (snake_case) -> WorkerJobRow. */
export function toWorkerJobRow(r: {
  id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  submission_id: string | null;
  run_after?: string | null;
}): WorkerJobRow {
  return {
    id: r.id,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    submissionId: r.submission_id,
    runAfter: r.run_after ?? null,
  };
}
