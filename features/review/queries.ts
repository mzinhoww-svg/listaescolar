import "server-only";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import { createAdminClient } from "@/lib/supabase/admin";

import { documentRef, getDetail, listQueue, type QueueTab } from "./read-models";
import { createReviewRepository } from "./repository";
import { ReviewError } from "./errors";

/** Service role só DEPOIS de conferir `SessionActor` de admin (papel de `profiles`). */
function repoFor(actor: unknown) {
  if (!isSessionActor(actor) || actor.role !== "admin") throw new ReviewError("forbidden");
  return createReviewRepository(createAdminClient());
}

export const getReviewQueue = (actor: SessionActor, tab: QueueTab) => listQueue(repoFor(actor), tab);
export const getReviewDetail = (actor: SessionActor, id: string) => getDetail(repoFor(actor), id);
export const getReviewDocumentRef = (actor: SessionActor, id: string) => documentRef(repoFor(actor), id);
