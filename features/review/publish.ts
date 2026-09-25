// Publicação humana (S10): SÓ pela porta ListPublisher da S09, com lease, teto de 45 s + AbortSignal, resultado validado
// e chave de idempotência = id da versão aprovada (distinta da chave `submissionId` da publicação automática).
import { normalizeName } from "../../supabase/functions/_shared/ai/extraction-normalize";
import type { PublicationDeps } from "../../supabase/functions/_shared/publication/decide";
import {
  asPortError,
  PortError,
  publishResultSchema,
  type ListPublisher,
  type PublishItem,
  type PublishRequest,
  type PublishResult,
} from "../../supabase/functions/_shared/publication/ports";

import { PUBLISH_FAIL_INVALID_ITEMS, PUBLISH_FAIL_INVALID_RESULT, PUBLISH_FAIL_REJECTED } from "./codes";
import { publicationBlockers } from "./gate";
import type { PublishOutcome, ReviewStore, ReviewVersion } from "./types";

export type ReviewPublicationDeps = Pick<PublicationDeps, "publisher" | "context" | "clock">;
export type OnAlert = (a: { code: string; submissionId: string }) => void;

export const HUMAN_PUBLISH_LEASE_SECONDS = 120;
export const HUMAN_PUBLISH_TIMEOUT_MS = 45_000;
const CODE = /^[a-z][a-z0-9_]{0,59}$/;

/** Itens da versão aprovada para a porta; `null` se algum item não estiver completo. Item da equipe = confiança 1 ("conferido"). */
export function toPublishItems(v: ReviewVersion): PublishItem[] | null {
  const out: PublishItem[] = [];
  for (const [i, it] of v.items.entries()) {
    if (it.quantity === null || it.category === null) return null;
    out.push({
      position: i + 1,
      originalName: it.name,
      normalizedName: normalizeName(it.name) || it.name.toLowerCase().slice(0, 300),
      category: it.category,
      quantity: it.quantity,
      unit: it.unit,
      confidence: it.origin === "extracted" ? (it.confidence ?? 1) : 1,
    });
  }
  return out.length > 0 ? out : null;
}

const safeAlert = (onAlert: OnAlert | undefined, code: string, submissionId: string): void => {
  try {
    onAlert?.({ code, submissionId });
  } catch {
    // o alerta nunca derruba a publicação
  }
};

async function callWithTimeout(publisher: ListPublisher, req: PublishRequest, clock: PublicationDeps["clock"], onLate: (late: unknown) => void): Promise<unknown> {
  const abort = new AbortController();
  const timer = new AbortController();
  let timedOut = false;
  const call = Promise.resolve().then(() => publisher.publish({ ...req, signal: abort.signal }));
  const timeout = clock.delay(HUMAN_PUBLISH_TIMEOUT_MS, timer.signal).then((): never => {
    timedOut = true;
    abort.abort();
    throw new PortError("publish_timeout", true);
  });
  try {
    return await Promise.race([call, timeout]);
  } catch (e) {
    if (timedOut) call.then(onLate, () => undefined);
    throw e;
  } finally {
    timer.abort();
  }
}

export async function publishApproved(o: {
  store: ReviewStore;
  publication: ReviewPublicationDeps;
  actorId: string;
  submissionId: string;
  onAlert?: OnAlert;
}): Promise<PublishOutcome> {
  const { store, publication, actorId, submissionId: id } = o;
  const ctx = await store.loadContext(id);
  if (!ctx || ctx.submission.status !== "approved") return { status: "not_reviewable" };
  const { publisher, context } = publication;
  if (!publisher || !context) return { status: "publish_unavailable" };

  let pctx;
  try {
    pctx = await context.load({ schoolId: ctx.submission.schoolId, grade: ctx.version.grade, schoolYear: ctx.version.schoolYear, submittedBy: ctx.submission.submittedBy });
  } catch (e) {
    const known = asPortError(e);
    if (!known || known.transient) return { status: "publish_pending" };
    pctx = null;
  }
  const blockers = publicationBlockers({ schoolId: ctx.submission.schoolId, grade: ctx.version.grade, schoolYear: ctx.version.schoolYear, items: ctx.version.items }, pctx);
  if (blockers.length > 0 || !pctx?.gradeSlug || ctx.submission.schoolId === null || ctx.version.schoolYear === null) {
    const code = blockers[0] ?? "context_unavailable";
    return fail(store, actorId, id, code);
  }

  const lease = await store.beginPublish(id, actorId, HUMAN_PUBLISH_LEASE_SECONDS);
  if (lease.state === "busy") return { status: "publish_pending" };
  if (lease.state === "orphaned") return { status: "orphaned" };
  if (lease.state === "not_approved") return { status: "not_reviewable" };
  if (lease.state === "already_completed") return { status: "published", listId: null, previousVersionId: null, newVersionId: null };
  if (!lease.approvedVersionId) return { status: "not_reviewable" };

  const approved = await store.loadVersion(id, lease.approvedVersionId);
  const items = approved ? toPublishItems(approved) : null;
  if (!approved || !items) return fail(store, actorId, id, PUBLISH_FAIL_INVALID_ITEMS);

  const request: PublishRequest = {
    idempotencyKey: approved.id,
    submissionId: id,
    schoolId: ctx.submission.schoolId,
    gradeSlug: pctx.gradeSlug,
    schoolYear: ctx.version.schoolYear,
    source: ctx.submission.source === "parent" ? "parent_upload" : "school_upload",
    actor: { kind: "admin", profileId: actorId },
    items,
  };
  const settleLate = async (late: unknown): Promise<void> => {
    const parsed = publishResultSchema.safeParse(late);
    if (!parsed.success) return safeAlert(o.onAlert, "publish_result_invalid", id);
    try {
      const done = await store.completePublish(id, actorId, { ...parsed.data });
      safeAlert(o.onAlert, done === "orphaned" ? "published_after_failure" : done === "not_approved" ? "published_not_recorded" : "publish_result_late", id);
    } catch {
      safeAlert(o.onAlert, "publish_result_late_unrecorded", id);
    }
  };

  let raw: unknown;
  try {
    raw = await callWithTimeout(publisher, request, publication.clock, (late) => void settleLate(late));
  } catch (e) {
    const known = asPortError(e);
    if (known && !known.transient) return fail(store, actorId, id, CODE.test(known.code) ? known.code : PUBLISH_FAIL_REJECTED);
    await store.releasePublish(id, actorId); // transitório ou desconhecido: nova tentativa não espera a lease vencer
    return { status: "publish_pending" };
  }
  const checked = publishResultSchema.safeParse(raw);
  if (!checked.success) {
    safeAlert(o.onAlert, "publish_result_invalid", id);
    return fail(store, actorId, id, PUBLISH_FAIL_INVALID_RESULT);
  }
  const result: PublishResult = checked.data;
  const done = await store.completePublish(id, actorId, { newVersionId: result.newVersionId, previousVersionId: result.previousVersionId, listId: result.listId });
  if (done === "orphaned" || done === "not_approved") {
    safeAlert(o.onAlert, done === "orphaned" ? "published_after_failure" : "published_not_recorded", id);
    return done === "orphaned" ? { status: "orphaned" } : { status: "not_reviewable" };
  }
  return { status: "published", listId: result.listId, previousVersionId: result.previousVersionId, newVersionId: result.newVersionId };
}

async function fail(store: ReviewStore, actorId: string, id: string, code: string): Promise<PublishOutcome> {
  const r = await store.failPublish(id, actorId, code);
  return r === "failed" ? { status: "publish_failed", code } : { status: "not_reviewable" };
}
