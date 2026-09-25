import type { ExtractionResult } from "./schemas";

export type ExtractionInput = {
  bytes: Uint8Array;
  mime: string;
  fileName: string;
  grade?: string;
  schoolYear?: number;
};

/** A S08 fornece a implementação real. Sem pipeline configurado, o envio só grava e enfileira. */
export interface ExtractionPipeline {
  /** Demonstração: os envios ficam marcados `is_demo`. */
  readonly isDemo?: boolean;
  extract(input: ExtractionInput, opts: { signal: AbortSignal }): Promise<ExtractionResult>;
}

export interface Clock {
  now(): number;
  /** Resolve após `ms`; se `signal` abortar, o temporizador é limpo (a promessa nunca resolve). */
  delay(ms: number, signal?: AbortSignal): Promise<void>;
}

export type NewSubmission = {
  profileId: string;
  source: "parent" | "school";
  schoolId?: string;
  grade: string;
  schoolYear: number;
  fileName: string;
  mime: string;
  sizeBytes: number;
  bytes: Uint8Array;
  isDemo: boolean;
  consent: { purpose: string; textVersion: string };
};

export interface SubmissionStore {
  /** Grava consentimento, arquivo e envio (status `processing`), tudo ou nada. */
  createSubmission(input: NewSubmission): Promise<{ submissionId: string }>;
  setStatus(submissionId: string, status: "processing_async" | "rejected"): Promise<void>;
  /** Resultado dentro do orçamento: persiste e leva o envio a `review_needed`. */
  recordSyncResult(submissionId: string, result: ExtractionResult, durationMs: number): Promise<void>;
}

export interface JobQueue {
  /** Idempotente por envio: nunca dois jobs para o mesmo `submissionId`. */
  enqueue(submissionId: string): Promise<{ jobId: string }>;
}

export type SubmitDeps = {
  /** `null`: nenhum pipeline configurado; grava, enfileira e a tela informa indisponibilidade. */
  pipeline: ExtractionPipeline | null;
  store: SubmissionStore;
  queue: JobQueue;
  clock: Clock;
  budgetMs?: number;
};

export type SubmitResult =
  | { status: "review_needed"; submissionId: string; result: ExtractionResult }
  | { status: "processing_async"; submissionId: string; jobId: string; pipelineAvailable: boolean }
  | { status: "failed"; submissionId: string; reason: string };
