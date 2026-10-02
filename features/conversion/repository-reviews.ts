import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import { ConversionError } from "./errors";
import type { ReviewHideReason, ReviewTag, ReviewView } from "./ports";
import { fail, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
// ---------------------------------------------------------------------------
// lead_review_create (App23) / leitura pública (Pap08)
// ---------------------------------------------------------------------------
export async function createReview(
  admin: SupabaseClient,
  actor: SessionActor,
  leadId: string,
  input: { rating: number; tags: ReviewTag[]; comment: string | null },
): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_review_create", {
    p_lead_id: leadId,
    p_actor_id: actor.userId,
    p_rating: input.rating,
    p_tags: input.tags,
    p_comment: input.comment,
  });
  if (error) fail("enviar avaliação", error);
  return z.uuid().parse(data);
}

const reviewRow = z.object({
  id: z.uuid(),
  lead_id: z.uuid(),
  stationery_id: z.uuid(),
  rating: z.number().int(),
  tags: z.array(z.string()),
  comment: z.string().nullable(),
  status: z.enum(["published", "hidden"]),
  is_demo: z.boolean(),
  hidden_reason: z.string().nullable(),
  created_at: z.string(),
});

function toReview(r: z.infer<typeof reviewRow>): ReviewView {
  return {
    id: r.id,
    leadId: r.lead_id,
    stationeryId: r.stationery_id,
    rating: r.rating,
    tags: r.tags,
    comment: r.comment,
    status: r.status,
    isDemo: r.is_demo,
    hiddenReason: r.hidden_reason as ReviewHideReason | null,
    createdAt: new Date(r.created_at),
  };
}

/**
 * Avaliações publicadas da papelaria (Pap08, perfil público): sem exigir ator (dado público). Revisão de segurança:
 * avaliação `is_demo` só aparece se a PRÓPRIA papelaria também for `is_demo` — nunca mostra um "brincadeira" numa
 * papelaria real (o resto do perfil já tem o selo "Demonstração" quando a papelaria é demo; não repete por avaliação).
 */
export async function listPublishedReviews(admin: SupabaseClient, stationeryId: string, limit: number): Promise<ReviewView[]> {
  const [reviewsRes, stationeryRes] = await Promise.all([
    admin
      .from("lead_reviews")
      .select("id, lead_id, stationery_id, rating, tags, comment, status, is_demo, hidden_reason, created_at")
      .eq("stationery_id", stationeryId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin.from("stationeries").select("is_demo").eq("id", stationeryId).maybeSingle(),
  ]);
  if (reviewsRes.error) fail("ler avaliações", reviewsRes.error);
  if (stationeryRes.error) fail("ler papelaria", stationeryRes.error);
  const stationeryIsDemo = z.object({ is_demo: z.boolean() }).nullable().parse(stationeryRes.data)?.is_demo ?? false;
  return z
    .array(reviewRow)
    .parse(reviewsRes.data ?? [])
    .filter((r) => stationeryIsDemo || !r.is_demo)
    .map(toReview);
}

/** Avaliações recentes para moderação (admin, todas as papelarias, publicadas e ocultas). */
export async function listRecentReviewsForAdmin(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<ReviewView[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe modera avaliações", "forbidden");
  const { data, error } = await admin
    .from("lead_reviews")
    .select("id, lead_id, stationery_id, rating, tags, comment, status, is_demo, hidden_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar avaliações para moderação", error);
  return z.array(reviewRow).parse(data ?? []).map(toReview);
}

/** `lead_review_hide`: só admin, motivo de lista fechada (nunca texto livre do moderador). Idempotente. */
export async function hideReview(admin: SupabaseClient, actor: SessionActor, reviewId: string, reason: ReviewHideReason): Promise<string> {
  requireActor(actor);
  if (actor.role !== "admin") throw new ConversionError("só a equipe modera avaliações", "forbidden");
  const { data, error } = await admin.rpc("lead_review_hide", { p_review_id: reviewId, p_actor_id: actor.userId, p_reason: reason });
  if (error) fail("ocultar avaliação", error);
  return z.uuid().parse(data);
}
