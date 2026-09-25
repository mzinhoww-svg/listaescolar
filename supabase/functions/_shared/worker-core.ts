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
  complete(jobId: string, result: unknown, durationMs: number): Promise<void>;
  /**
   * Devolve o novo status do job (`retrying` ou `dead`). `permanent`: falha sem chance de sucesso
   * (ex.: arquivo armazenado inválido); vai direto a `dead`.
   */
  fail(jobId: string, error: string, retryInSeconds: number, permanent?: boolean): Promise<string>;
  /** Re-envia à fila mensagens de jobs vencidos (lease expirado, retry devido) e mata os sem tentativas. */
  requeueStale(): Promise<void>;
}

export interface WorkerQueue {
  read(qty: number, vtSeconds: number): Promise<{ msgId: number; readCount: number; jobId: string | null }[]>;
  ack(msgId: number): Promise<void>;
  setVt(msgId: number, vtSeconds: number): Promise<void>;
}

export type WorkerDeps = {
  jobs: WorkerJobs;
  pipeline: {
    extract(input: WorkerInput, opts: { signal: AbortSignal }): Promise<unknown>;
  };
  loadInput(submissionId: string): Promise<WorkerInput | null>;
  clock: { now(): number; delay(ms: number, signal?: AbortSignal): Promise<void> };
  /** Teto de uma extração no worker. */
  timeoutMs?: number;
  /** [0,1): jitter do backoff; padrão 0 (determinístico). */
  random?: () => number;
};

export const BACKOFF_BASE_SECONDS = 30;
export const BACKOFF_FACTOR = 2;
export const BACKOFF_CAP_SECONDS = 15 * 60;
export const BACKOFF_MAX_JITTER = 0.2;
/** Tempo máximo de uma extração no worker. Tem de ficar abaixo da lease de `running` do banco (5 min). */
export const WORKER_TIMEOUT_MS = 90_000;
export const BUSY_RETRY_SECONDS = 60;
export const DEFAULT_NOT_DUE_SECONDS = 30;

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

/** Mensagem de erro para `jobs.last_error`: sem e-mail, telefone/números longos, truncada. */
export function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/\d{6,}/g, "[num]")
      .replace(/[\u0000-\u001f]/g, " ")
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

async function runWithTimeout(deps: WorkerDeps, input: WorkerInput): Promise<unknown> {
  const abort = new AbortController();
  const timer = new AbortController();
  const timeout = deps.clock
    .delay(deps.timeoutMs ?? WORKER_TIMEOUT_MS, timer.signal)
    .then((): never => {
      abort.abort();
      throw new Error("timeout do pipeline");
    });
  try {
    return await Promise.race([deps.pipeline.extract(input, { signal: abort.signal }), timeout]);
  } finally {
    timer.abort();
  }
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
    const status = await deps.jobs.fail(jobId, error, delay, permanent);
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
    result = await runWithTimeout(deps, input);
  } catch (e) {
    return failWith(sanitizeError(e));
  }
  await deps.jobs.complete(jobId, result, Math.max(0, Math.round(deps.clock.now() - started)));
  return { outcome: "done", ack: true };
}

export async function processJob(jobId: string, deps: WorkerDeps): Promise<JobOutcome> {
  return (await processMessage(jobId, deps)).outcome;
}

export type TickSummary = Record<JobOutcome, number> & { errors: number; read: number };

/** Um ciclo do worker: lê mensagens, processa, confirma ou reprograma. Erro de infraestrutura não confirma. */
export async function handleTick(
  queue: WorkerQueue,
  deps: WorkerDeps,
  opts: { batch?: number; vtSeconds?: number } = {},
): Promise<TickSummary> {
  const summary: TickSummary = { done: 0, retry: 0, dead: 0, skipped: 0, errors: 0, read: 0 };
  const vt = opts.vtSeconds ?? 120;
  await deps.jobs.requeueStale(); // antes de ler: jobs vencidos voltam à fila
  const messages = await queue.read(opts.batch ?? 5, vt);
  summary.read = messages.length;
  for (const m of messages) {
    if (!m.jobId) {
      await queue.ack(m.msgId); // mensagem sem job_id: veneno, descarta
      summary.skipped += 1;
      continue;
    }
    try {
      const r = await processMessage(m.jobId, deps);
      summary[r.outcome] += 1;
      if (r.ack) await queue.ack(m.msgId);
      else if (r.retryInSeconds !== undefined) await queue.setVt(m.msgId, r.retryInSeconds);
    } catch {
      summary.errors += 1; // sem ack: a mensagem volta após o vt
    }
  }
  return summary;
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
    complete: async (jobId, result, durationMs) => {
      await call(rpc, "jobs_complete", { p_job_id: jobId, p_result: result, p_duration_ms: durationMs });
    },
    fail: async (jobId, error, retryInSeconds) =>
      String(
        await call(rpc, "jobs_fail", {
          p_job_id: jobId,
          p_error: error,
          p_retry_in_seconds: retryInSeconds,
          // `permanent` ainda não existe em public.jobs_fail (migration 0201): hoje a falha permanente segue o
          // retry normal e vira `dead` ao esgotar as tentativas. Quando o parâmetro `p_permanent` existir, envie-o aqui.
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
