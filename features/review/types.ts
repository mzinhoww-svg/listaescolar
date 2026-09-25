import type { BlockerCode, RejectReason } from "./codes";
import type { ReviewItem } from "./schemas";

export type ReviewVersion = {
  id: string;
  version: number;
  grade: string | null;
  schoolYear: number | null;
  items: ReviewItem[];
  origin: "extraction" | "admin_edit";
  createdAt: string;
};

export type ResultAlerts = { alerts?: string[]; criticalAlerts?: string[]; items: { alerts?: string[] }[] } | null;

/** O que o serviço precisa do envio (sem arquivo, caminho, nome ou contato). */
export type ReviewContext = {
  submission: { status: string; source: "parent" | "school"; schoolId: string | null; submittedBy: string; isDemo: boolean };
  /** Versão vigente da revisão (a aprovada, se o envio está `approved`). */
  version: ReviewVersion;
  /** Alertas do resultado da extração (não da versão editada): base do alerta crítico e da confirmação. */
  resultAlerts: ResultAlerts;
};

export type SaveOutcome =
  | { state: "saved"; version: number; versionId: string }
  | { state: "stale"; version: number; versionId: string }
  | { state: "not_reviewable" };

export type BeginOutcome = {
  state: "leased" | "busy" | "already_completed" | "not_approved" | "orphaned";
  approvedVersionId: string | null;
};

export type Transition = "stale" | "not_reviewable";

/** Funções `review_*` da 0204 (por RPC) + as leituras que o serviço precisa. O `actorId` vem só da sessão. */
export interface ReviewStore {
  open(submissionId: string, actorId: string): Promise<{ version: number; versionId: string }>;
  save(submissionId: string, actorId: string, expectedVersion: number, payload: { grade: string | null; schoolYear: number | null; items: ReviewItem[] }): Promise<SaveOutcome>;
  approve(submissionId: string, actorId: string, expectedVersion: number, reasons: string[]): Promise<"approved" | Transition>;
  reject(submissionId: string, actorId: string, expectedVersion: number, reason: RejectReason): Promise<"rejected" | Transition>;
  loadContext(submissionId: string): Promise<ReviewContext | null>;
  loadVersion(submissionId: string, versionId: string): Promise<ReviewVersion | null>;
  beginPublish(submissionId: string, actorId: string, leaseSeconds: number): Promise<BeginOutcome>;
  releasePublish(submissionId: string, actorId: string): Promise<void>;
  completePublish(
    submissionId: string,
    actorId: string,
    result: { newVersionId: string; previousVersionId: string | null; listId: string | null },
  ): Promise<"completed" | "already_completed" | "not_approved" | "orphaned">;
  failPublish(submissionId: string, actorId: string, reason: string): Promise<"failed" | "not_approved">;
}

export type ReviewOutcome =
  | { status: "saved"; version: number; versionId: string }
  | { status: "stale"; version?: number; versionId?: string }
  | { status: "not_reviewable" }
  | { status: "blocked"; codes: BlockerCode[] }
  | { status: "approved" }
  | { status: "rejected" };

export type PublishOutcome =
  | { status: "published"; listId: string | null; previousVersionId: string | null; newVersionId: string | null }
  | { status: "publish_pending" }
  | { status: "publish_unavailable" }
  | { status: "publish_failed"; code: string }
  | { status: "orphaned" }
  | { status: "not_reviewable" };
