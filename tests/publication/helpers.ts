import { PortError, type PendingRow, type PublicationContextReader, type PublicationStore, type StoredInput, type VerdictPayload } from "../../supabase/functions/_shared/publication/ports";
import type { PublicationContext, PublicationSettings } from "../../supabase/functions/_shared/publication/types";
import type { PublicationDeps } from "../../supabase/functions/_shared/publication/decide";
import { MemoryListPublisher } from "../../supabase/functions/_shared/publication/memory";
import { FakeClock } from "../helpers/fake-clock";

export const SUBMISSION = "10000000-0000-4000-8000-0000000000aa";
export const SCHOOL = "50000000-0000-4000-8000-000000000001";
export const MEMBER = "00000000-0000-4000-8000-000000000002";

// Valores sintéticos de teste (os limiares reais vêm de ai_settings).
export const settings = (over: Partial<PublicationSettings> = {}): PublicationSettings => ({
  confidenceThreshold: 0.8,
  itemConfidenceThreshold: 0.6,
  criticalAlerts: ["handwritten", "invalid_school_grade_year", "text_document_mismatch"],
  autoPublishEnabled: true,
  ...over,
});

export const goodResult = (): Record<string, unknown> => ({
  items: [
    { name: "Caderno", quantity: 2, unit: "un", confidence: 0.9, normalizedName: "caderno", category: "papelaria", alerts: [] },
    { name: "Lápis", quantity: 12, unit: null, confidence: 0.95, normalizedName: "lapis", category: "escrita", alerts: [] },
  ],
  overallConfidence: 0.92,
  warnings: [],
  pipelineVersion: "s08.1",
  alerts: [],
  criticalAlerts: [],
  lowConfidence: false,
  requiresReview: true,
});

export const goodInput = (over: Partial<StoredInput> = {}): StoredInput => ({
  status: "review_needed",
  source: "school",
  schoolId: SCHOOL,
  submittedBy: MEMBER,
  grade: "4º ano",
  schoolYear: 2027,
  isDemo: false,
  result: goodResult(),
  ...over,
});

export const goodContext = (over: Partial<PublicationContext> = {}): PublicationContext => ({
  school: { verification: "verified", municipalityEnabled: true },
  gradeSlug: "ef-4",
  validSchoolYears: [2026, 2027],
  submitterLinked: true,
  currentList: null,
  ...over,
});

export type Row = { decision: string; justification: string; reasons: string[]; previousVersionId: string | null; newVersionId: string | null; payload?: VerdictPayload };

/** Espelho em memória das funções publication_* da 0203 (lock = seção síncrona; lease e expiração como no SQL). */
export class MemoryPublicationStore implements PublicationStore {
  status: string;
  readonly rows: Row[] = [];
  updatedAt = 0;
  leaseUntil = 0;
  readonly calls = { recordVerdict: 0, complete: 0, fail: 0, expire: 0, beginPublish: 0 };
  input: StoredInput;
  /** Gancho de teste: roda antes de `loadInput` responder (para forçar interleavings). */
  yieldOnLoad = true;

  constructor(private readonly clock: FakeClock, input: StoredInput = goodInput()) {
    this.input = input;
    this.status = input.status;
  }

  private has(decision: string): boolean {
    return this.rows.some((r) => r.decision === decision);
  }

  async loadInput(): Promise<StoredInput> {
    if (this.yieldOnLoad) await Promise.resolve();
    return { ...this.input, status: this.status };
  }

  async recordVerdict(_id: string, v: VerdictPayload): Promise<"recorded" | "already_decided" | "not_ready"> {
    this.calls.recordVerdict += 1;
    if (this.has("auto_publish") || this.has("human_review")) return "already_decided";
    if (["draft", "submitted", "processing", "processing_async", "rejected"].includes(this.status)) return "not_ready";
    if (this.status !== "review_needed") return "already_decided";
    this.rows.push({ decision: v.decision, justification: v.justification, reasons: v.reasons, previousVersionId: null, newVersionId: null, payload: v });
    this.status = v.decision === "auto_publish" ? "approved" : "human_review";
    this.updatedAt = this.clock.now();
    return "recorded";
  }

  async beginPublish(_id: string, leaseSeconds: number): Promise<"leased" | "busy" | "already_completed" | "not_approved"> {
    this.calls.beginPublish += 1;
    if (this.has("published")) return "already_completed";
    if (this.status !== "approved" || !this.has("auto_publish") || this.has("publish_failed")) return "not_approved";
    if (this.leaseUntil > this.clock.now()) return "busy";
    this.leaseUntil = this.clock.now() + leaseSeconds * 1000;
    return "leased";
  }

  async complete(_id: string, r: { newVersionId: string; previousVersionId: string | null }): Promise<"completed" | "already_completed" | "not_approved" | "orphaned"> {
    this.calls.complete += 1;
    if (this.has("published")) return "already_completed";
    if (this.has("publish_failed")) {
      if (!this.has("publish_orphaned")) this.rows.push({ decision: "publish_orphaned", justification: "published_after_failure", reasons: [], previousVersionId: r.previousVersionId, newVersionId: r.newVersionId });
      return "orphaned";
    }
    if (this.status !== "approved" || !this.has("auto_publish")) return "not_approved";
    this.rows.push({ decision: "published", justification: "published", reasons: [], previousVersionId: r.previousVersionId, newVersionId: r.newVersionId });
    this.status = "published";
    this.leaseUntil = 0;
    return "completed";
  }

  async fail(_id: string, reason: string): Promise<"failed" | "already_failed" | "not_approved"> {
    this.calls.fail += 1;
    if (this.has("publish_failed")) return "already_failed";
    if (this.status !== "approved" || !this.has("auto_publish") || this.has("published")) return "not_approved";
    this.rows.push({ decision: "publish_failed", justification: reason, reasons: [reason], previousVersionId: null, newVersionId: null });
    this.status = "human_review";
    this.leaseUntil = 0;
    return "failed";
  }

  async expire(id: string, minAgeSeconds: number): Promise<"failed" | "in_progress" | "not_due" | "already_failed" | "not_approved"> {
    this.calls.expire += 1;
    if (this.has("publish_failed")) return "already_failed";
    if (this.status !== "approved" || !this.has("auto_publish") || this.has("published")) return "not_approved";
    if (this.leaseUntil > this.clock.now()) return "in_progress";
    if (this.clock.now() - this.updatedAt < minAgeSeconds * 1000) return "not_due";
    const r = await this.fail(id, "publish_expired");
    return r === "failed" ? "failed" : "not_approved";
  }

  async pending(limit: number, minAgeSeconds: number): Promise<PendingRow[]> {
    const old = this.clock.now() - this.updatedAt >= minAgeSeconds * 1000;
    const out: PendingRow[] = [];
    if (this.status === "review_needed" && old && !this.has("auto_publish") && !this.has("human_review")) out.push({ submissionId: SUBMISSION, state: "decide", updatedAt: new Date(this.updatedAt).toISOString() });
    if (this.status === "approved" && old && this.has("auto_publish") && !this.has("published") && !this.has("publish_failed") && this.leaseUntil <= this.clock.now())
      out.push({ submissionId: SUBMISSION, state: "publish", updatedAt: new Date(this.updatedAt).toISOString() });
    return out.slice(0, limit);
  }
}

export type Kit = {
  clock: FakeClock;
  store: MemoryPublicationStore;
  publisher: MemoryListPublisher;
  deps: PublicationDeps;
  alerts: { code: string; submissionId: string }[];
};

/** Deps completas em memória; `over` sobrescreve peças (inclusive para `null`). */
export function kit(over: Partial<PublicationDeps> = {}, input: StoredInput = goodInput(), ctx: PublicationContext = goodContext()): Kit {
  const clock = new FakeClock();
  const store = new MemoryPublicationStore(clock, input);
  const publisher = new MemoryListPublisher();
  const alerts: Kit["alerts"] = [];
  const reader: PublicationContextReader = { load: async () => ctx };
  const deps: PublicationDeps = {
    store,
    settings: { load: async () => settings() },
    context: reader,
    publisher,
    clock,
    onAlert: (a) => alerts.push(a),
    ...over,
  };
  return { clock, store, publisher, deps, alerts };
}

export const transient = (code = "boom") => new PortError(code, true);
export const permanent = (code = "rejected") => new PortError(code, false);
