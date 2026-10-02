// Tipos, constantes e utilitários puros do worker do OCR. Sem APIs do Deno nem imports: roda na Edge Function e
// no Vitest. Extraído de worker-core.ts (D-057, S18, arquivo com 424 linhas) — comportamento idêntico ao original.

import type { Emit } from "./analytics/capture.ts";

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
  /** Gancho de medição (ADR-007): `ocr_completed` depois de `jobs.complete`. Nunca altera o resultado do job. */
  emit?: Emit;
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

export type TickSummary = Record<JobOutcome, number> & {
  errors: number;
  read: number;
  deferred: number;
  /** Resumo do varredor da publicação (contagens), quando rodou. */
  sweep?: Record<string, number>;
};
export type TickError = { stage: "requeue" | "read" | "message" | "decide" | "sweep"; jobId?: string; message: string };
