// Portas da decisão de publicação (ADR-004): efeitos entre trilhas passam por aqui. TypeScript puro (Deno e Node).
// `ListPublisher` e `PublicationContextReader` têm implementação em memória (memory.ts, só com fixture em ambiente
// não produtivo); a implementação real (lists, versions, schools) é da S11 e roda a suíte de contrato.
import type { PublicationContext } from "./types.ts";

/** Erro de uma porta ou do store. `transient`: vale repetir (rede, banco); permanente: não vale. Erro sem tipo = transitório. */
export class PortError extends Error {
  readonly code: string;
  readonly transient: boolean;
  constructor(code: string, transient: boolean) {
    super(code);
    this.name = "PortError";
    this.code = code;
    this.transient = transient;
  }
}

/** Erro conhecido (PortError, mesmo vindo de outra cópia do módulo) ou nulo. */
export function asPortError(e: unknown): { code: string; transient: boolean } | null {
  const x = e as { name?: unknown; code?: unknown; transient?: unknown } | null;
  if (!x || x.name !== "PortError" || typeof x.code !== "string" || typeof x.transient !== "boolean") return null;
  return { code: x.code, transient: x.transient };
}

export type ContextQuery = { schoolId: string | null; grade: string | null; schoolYear: number | null; submittedBy: string };

export interface PublicationContextReader {
  load(q: ContextQuery): Promise<PublicationContext>;
}

export type PublishItem = {
  position: number;
  originalName: string;
  normalizedName: string;
  category: string;
  quantity: number;
  unit: string | null;
  confidence: number;
};

export type PublishRequest = {
  /** = submissionId: a porta é idempotente por esta chave (repetir devolve o mesmo resultado). */
  idempotencyKey: string;
  submissionId: string;
  schoolId: string;
  gradeSlug: string;
  schoolYear: number;
  source: "school_upload";
  actor: { kind: "system" };
  items: PublishItem[];
};

export type PublishResult = { listId: string; previousVersionId: string | null; newVersionId: string };

export interface ListPublisher {
  publish(req: PublishRequest): Promise<PublishResult>;
}

/** Entrada lida do banco (sem arquivo, caminho, nome ou contato). */
export type StoredInput = {
  status: string;
  source: "parent" | "school";
  schoolId: string | null;
  submittedBy: string;
  grade: string | null;
  schoolYear: number | null;
  isDemo: boolean;
  result: unknown | null;
};

/** Payload de `publication_record_verdict` (chaves em snake_case, como a função SQL). */
export type VerdictPayload = {
  decision: "auto_publish" | "human_review";
  justification: string;
  reasons: string[];
  overall_score?: number | null;
  item_scores?: number[];
  alerts?: string[];
  pipeline_version: string;
  started_at?: string;
  finished_at?: string;
  latency_ms?: number;
};

export type PendingRow = { submissionId: string; state: "decide" | "publish"; updatedAt: string };

/** Persistência da decisão (funções `publication_*` da 0203). Erros de infraestrutura lançam. */
export interface PublicationStore {
  loadInput(submissionId: string): Promise<StoredInput>;
  recordVerdict(submissionId: string, verdict: VerdictPayload): Promise<"recorded" | "already_decided" | "not_ready">;
  beginPublish(submissionId: string, leaseSeconds: number): Promise<"leased" | "busy" | "already_completed" | "not_approved">;
  complete(
    submissionId: string,
    result: { newVersionId: string; previousVersionId: string | null },
  ): Promise<"completed" | "already_completed" | "not_approved" | "orphaned">;
  fail(submissionId: string, reason: string): Promise<"failed" | "already_failed" | "not_approved">;
  expire(submissionId: string, minAgeSeconds: number): Promise<"failed" | "in_progress" | "not_due" | "already_failed" | "not_approved">;
  pending(limit: number, minAgeSeconds: number): Promise<PendingRow[]>;
}
