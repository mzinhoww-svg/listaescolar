import { vi } from "vitest";
import type { ReviewContext, ReviewStore, ReviewVersion, BeginOutcome, SaveOutcome } from "@/features/review/types";
import type { ReviewItem } from "@/features/review/schemas";
import type { PublicationDeps } from "@/supabase/functions/_shared/publication/decide";
import { MemoryListPublisher, MemoryPublicationContextReader, parsePublicationFixture } from "@/supabase/functions/_shared/publication/memory";
import type { PublicationSettings } from "@/supabase/functions/_shared/publication/types";

export const ADMIN_ID = "00000000-0000-4000-8000-000000000003";
export const PARENT_ID = "00000000-0000-4000-8000-000000000001";
export const SCHOOL = "50000000-0000-4000-8000-0000000000c1";
export const SUB = "10000000-0000-4000-8000-0000000000a1";
export const V2 = "80000000-0000-4000-8000-0000000000b2";

export const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({ name: "Caderno", quantity: 2, unit: "un", category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...over });
export const version = (over: Partial<ReviewVersion> = {}): ReviewVersion => ({ id: V2, version: 2, grade: "4º ano", schoolYear: 2027, items: [item(), item({ name: "Lápis", quantity: 12, category: "escrita" })], origin: "admin_edit", createdAt: "2026-09-25T12:00:00Z", ...over });

export const SETTINGS: PublicationSettings = { confidenceThreshold: 0.8, itemConfidenceThreshold: 0.6, criticalAlerts: ["handwritten"], autoPublishEnabled: false };
export const FIXTURE = JSON.stringify({
  schools: [{ id: SCHOOL, verification: "registered", municipalityEnabled: true, linkedProfiles: [], label: { name: "Escola Sintética", inep: "51000001" } }],
  grades: { "4º ano": "ef-4" },
  validSchoolYears: [2027],
});

export type Calls = { name: string; args: unknown[] }[];

/** Store falso: registra chamadas; estado do envio scriptável. */
export function fakeStore(over: { ctx?: Partial<ReviewContext> | null; fail?: "failed" | "not_approved" | "busy"; begin?: BeginOutcome; save?: SaveOutcome; approve?: "approved" | "stale" | "not_reviewable"; complete?: "completed" | "already_completed" | "not_approved" | "orphaned" } = {}) {
  const calls: Calls = [];
  const rec = <T,>(name: string, value: T) => (...args: unknown[]): Promise<T> => {
    calls.push({ name, args });
    return Promise.resolve(value);
  };
  const ctx: ReviewContext | null =
    over.ctx === null
      ? null
      : {
          submission: { status: "human_review", source: "school", schoolId: SCHOOL, submittedBy: PARENT_ID, isDemo: false },
          version: version(),
          resultAlerts: { alerts: [], criticalAlerts: [], items: [] },
          ...over.ctx,
        };
  const store: ReviewStore = {
    open: rec("open", { version: 1, versionId: V2 }),
    save: rec("save", over.save ?? ({ state: "saved", version: 3, versionId: "x" } as SaveOutcome)),
    approve: rec("approve", over.approve ?? "approved"),
    reject: rec("reject", "rejected" as const),
    loadContext: rec("loadContext", ctx),
    loadVersion: rec("loadVersion", ctx?.version ?? null),
    beginPublish: rec("beginPublish", over.begin ?? ({ state: "leased", approvedVersionId: V2 } as BeginOutcome)),
    releasePublish: rec("releasePublish", undefined),
    completePublish: rec("completePublish", over.complete ?? "completed"),
    failPublish: rec("failPublish", over.fail ?? ("failed" as const)),
    assignSchool: rec("assignSchool", "assigned" as const),
    reconcileOrphan: rec("reconcileOrphan", "reconciled" as const),
  } as ReviewStore;
  return { store, calls, names: () => calls.map((c) => c.name) };
}

export function memoryPublication(o: { publisher?: MemoryListPublisher | null; withContext?: boolean; settings?: PublicationSettings | null; clock?: PublicationDeps["clock"] } = {}) {
  const publisher = o.publisher === undefined ? new MemoryListPublisher() : o.publisher;
  const fixture = parsePublicationFixture(FIXTURE)!;
  const deps = {
    publisher,
    context: o.withContext === false ? null : new MemoryPublicationContextReader(fixture, publisher instanceof MemoryListPublisher ? publisher : undefined),
    settings: { load: vi.fn(async () => (o.settings === undefined ? SETTINGS : o.settings)) },
    clock: o.clock ?? { now: () => 0, delay: () => new Promise<void>(() => undefined) },
  };
  return { deps, publisher };
}
