import type { ExtractionResult } from "./schemas";

export type ExtractionInput = {
  /** Envio ao qual a leitura pertence: `entity_id` de toda decisão de IA (o pipeline real exige). */
  submissionId?: string;
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
  /** `budgetMs`: tempo total disponível (a Server Action usa 10 s; o worker, o prazo restante do tick). */
  extract(
    input: ExtractionInput,
    opts: { signal: AbortSignal; budgetMs?: number },
  ): Promise<ExtractionResult>;
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
  /**
   * Grava consentimento, arquivo, envio (status `processing`) e o job do envio (`running`, com lease, chave =
   * id do envio), tudo ou nada. O job existir desde já é o que permite recuperar um envio órfão.
   */
  createSubmission(input: NewSubmission): Promise<{ submissionId: string }>;
  /** Falha antes de haver worker: envio `rejected` e job `dead`, juntos. */
  reject(submissionId: string, reason: string): Promise<void>;
  /**
   * Resultado dentro do orçamento, UMA operação atômica: job `succeeded` + ocr_jobs + envio `review_needed`.
   * Lança se o job não estiver mais `running` (nada é gravado).
   */
  recordSyncResult(
    submissionId: string,
    result: ExtractionResult,
    durationMs: number,
  ): Promise<void>;
}

export interface JobQueue {
  /**
   * Devolve o job do envio à fila (`queued` + mensagem) e marca o envio `processing_async`, atomicamente.
   * Idempotente por envio: nunca dois jobs para o mesmo `submissionId`.
   */
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
