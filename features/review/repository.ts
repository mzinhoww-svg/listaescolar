import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { extractionResultSchema } from "../../supabase/functions/_shared/extraction-schema";

import { REJECT_REASONS } from "./codes";
import { reviewItemsSchema } from "./schemas";
import { ReviewError } from "./errors";
import type { BeginOutcome, ResultAlerts, ReviewContext, ReviewStore, ReviewVersion, SaveOutcome } from "./types";

/** Leituras e escritas da revisão pelo service role. QUEM chama confere `role === 'admin'` antes (queries.ts / service.ts). */
type PgError = { code?: string; message: string } | null;
const toError = (e: NonNullable<PgError>): ReviewError =>
  new ReviewError(e.code === "P0002" ? "not_found" : e.code === "42501" ? "forbidden" : e.code === "22023" ? "invalid_input" : "unavailable");

const uuid = z.string().uuid();
const versionRow = z.object({
  id: uuid,
  version: z.number().int(),
  grade: z.string().nullable(),
  school_year: z.number().int().nullable(),
  items: reviewItemsSchema,
  origin: z.enum(["extraction", "admin_edit"]),
  created_at: z.string(),
  actor_id: uuid.nullable(),
});
const VERSION_COLUMNS = "id, version, grade, school_year, items, origin, created_at, actor_id";
const toVersion = (r: z.infer<typeof versionRow>): ReviewVersion => ({ id: r.id, version: r.version, grade: r.grade, schoolYear: r.school_year, items: r.items, origin: r.origin, createdAt: r.created_at });

const subRow = z.object({ status: z.string(), source: z.enum(["parent", "school"]), school_id: uuid.nullable(), submitted_by: uuid, is_demo: z.boolean() });
const saveOut = z.union([
  z.object({ state: z.literal("saved"), version: z.number().int(), versionId: uuid }),
  z.object({ state: z.literal("stale"), version: z.number().int(), versionId: uuid }),
  z.object({ state: z.literal("not_reviewable") }),
]);
const beginOut = z.object({ state: z.enum(["leased", "busy", "already_completed", "not_approved", "orphaned"]), approvedVersionId: uuid.nullable() });
const openOut = z.object({ version: z.number().int(), versionId: uuid });

const alertsOf = (raw: unknown): ResultAlerts => {
  const p = extractionResultSchema.safeParse(raw);
  if (!p.success) return null;
  const r = p.data;
  return { alerts: r.alerts ?? [], criticalAlerts: r.criticalAlerts ?? [], items: r.items.map((i) => ({ alerts: i.alerts ?? [] })) };
};

export function createReviewRepository(client: SupabaseClient) {
  async function rpc<T>(fn: string, args: Record<string, unknown>, out: z.ZodType<T>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw toError(error);
    const parsed = out.safeParse(data);
    if (!parsed.success) throw new ReviewError("unavailable");
    return parsed.data;
  }
  const one = async <T,>(q: PromiseLike<{ data: T | null; error: PgError }>): Promise<T | null> => {
    const { data, error } = await q;
    if (error) throw new ReviewError("unavailable");
    return data;
  };

  async function latestVersion(submissionId: string): Promise<z.infer<typeof versionRow> | null> {
    const { data, error } = await client.from("review_versions").select(VERSION_COLUMNS).eq("submission_id", submissionId).order("version", { ascending: false }).limit(1);
    if (error) throw new ReviewError("unavailable");
    const row = data?.[0];
    if (!row) return null;
    const p = versionRow.safeParse(row);
    if (!p.success) throw new ReviewError("unavailable");
    return p.data;
  }
  async function resultOf(submissionId: string): Promise<unknown> {
    const { data, error } = await client.from("ocr_jobs").select("result").eq("submission_id", submissionId).not("result", "is", null).order("created_at", { ascending: false }).limit(1);
    if (error) throw new ReviewError("unavailable");
    return data?.[0]?.result ?? null;
  }

  const store: ReviewStore = {
    open: (id, actorId) => rpc("review_open", { p_submission_id: id, p_actor_id: actorId }, openOut),
    save: (id, actorId, expected, payload): Promise<SaveOutcome> =>
      rpc("review_save_version", { p_submission_id: id, p_actor_id: actorId, p_expected_version: expected, p_payload: { grade: payload.grade, school_year: payload.schoolYear, items: payload.items } }, saveOut),
    approve: (id, actorId, expected, reasons) =>
      rpc("review_approve", { p_submission_id: id, p_actor_id: actorId, p_expected_version: expected, p_reasons: reasons }, z.enum(["approved", "stale", "not_reviewable"])),
    reject: (id, actorId, expected, reason) => {
      if (!REJECT_REASONS.includes(reason)) throw new ReviewError("invalid_input");
      return rpc("review_reject", { p_submission_id: id, p_actor_id: actorId, p_expected_version: expected, p_reason: reason }, z.enum(["rejected", "stale", "not_reviewable"]));
    },
    async loadContext(id) {
      const s = await one(client.from("list_submissions").select("status, source, school_id, submitted_by, is_demo").eq("id", id).maybeSingle() as PromiseLike<{ data: unknown; error: PgError }>).then((raw) => (raw === null ? null : subRow.parse(raw)));
      const v = s ? await latestVersion(id) : null;
      if (!s || !v) return null;
      const ctx: ReviewContext = {
        submission: { status: s.status, source: s.source, schoolId: s.school_id, submittedBy: s.submitted_by, isDemo: s.is_demo },
        version: toVersion(v),
        resultAlerts: alertsOf(await resultOf(id)),
      };
      return ctx;
    },
    async loadVersion(id, versionId) {
      const { data, error } = await client.from("review_versions").select(VERSION_COLUMNS).eq("submission_id", id).eq("id", versionId).maybeSingle();
      if (error) throw new ReviewError("unavailable");
      if (!data) return null;
      const p = versionRow.safeParse(data);
      if (!p.success) throw new ReviewError("unavailable");
      return toVersion(p.data);
    },
    beginPublish: (id, actorId, seconds): Promise<BeginOutcome> => rpc("review_begin_publish", { p_submission_id: id, p_actor_id: actorId, p_lease_seconds: seconds }, beginOut),
    async releasePublish(id, actorId) {
      await rpc("review_release_publish", { p_submission_id: id, p_actor_id: actorId }, z.string());
    },
    completePublish: (id, actorId, r) =>
      rpc("review_complete_publish", { p_submission_id: id, p_actor_id: actorId, p_result: { newVersionId: r.newVersionId, previousVersionId: r.previousVersionId, listId: r.listId } }, z.enum(["completed", "already_completed", "not_approved", "orphaned"])),
    failPublish: (id, actorId, reason) => rpc("review_publish_fail", { p_submission_id: id, p_actor_id: actorId, p_reason: reason }, z.enum(["failed", "not_approved", "busy"])),
  };
  return { store, latestVersion, resultOf, client };
}
export type ReviewRepository = ReturnType<typeof createReviewRepository>;
