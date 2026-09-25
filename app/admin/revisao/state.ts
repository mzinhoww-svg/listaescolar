// Estado devolvido pelas Server Actions da revisão (useActionState). Só textos fixos: nada do Postgres nem do documento.
export type ReviewActionKind =
  | "idle"
  | "saved"
  | "approved"
  | "rejected"
  | "published"
  | "reconciled"
  | "assigned"
  | "pending"
  | "unavailable"
  | "blocked"
  | "failed"
  | "stale"
  | "error";

export type ReviewActionState = { kind: ReviewActionKind; message: string };

export const IDLE: ReviewActionState = { kind: "idle", message: "" };
export const state = (kind: ReviewActionKind, message: string): ReviewActionState => ({ kind, message });

/** Erros e conflitos pedem `role="alert"`; o resto é aviso de andamento (`role="status"`). */
export const isProblem = (k: ReviewActionKind): boolean => k === "error" || k === "stale" || k === "blocked" || k === "failed";
