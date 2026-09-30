"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/stationeries/actor";

import { conversionErrorCode } from "./messages";
import { REVIEW_TAGS, type ReviewTag } from "./ports";
import { getConversionService } from "./wiring";

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function logAndCode(what: string, error: unknown): string {
  const code = conversionErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

/** App22 "Você comprou?": o pai confirma, ainda não sabe, ou comprou em outro lugar. */
export async function confirmPurchaseAction(formData: FormData): Promise<void> {
  const back = "/conta/compras";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  try {
    await getConversionService().confirmPurchase(actor, { leadId: text(formData, "leadId"), answer: text(formData, "answer") });
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("confirmar compra", error)}`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}

/** App23 Avaliar: nota, etiquetas fixas e comentário opcional (recusado se tiver dado pessoal). */
export async function createReviewAction(formData: FormData): Promise<void> {
  const back = "/conta/compras";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  const tags = formData.getAll("tags").filter((t): t is ReviewTag => typeof t === "string" && (REVIEW_TAGS as readonly string[]).includes(t));
  const ratingRaw = Number(text(formData, "rating"));
  // Sem nota escolhida (nenhum padrão pré-marcado, UX-027): volta com mensagem própria, sem chamar o serviço.
  if (text(formData, "rating") === "") redirect(`${back}?erro=rating_required`);
  try {
    await getConversionService().createReview(actor, {
      leadId: text(formData, "leadId"),
      rating: Number.isFinite(ratingRaw) ? ratingRaw : 0,
      tags,
      comment: text(formData, "comment") || null,
    });
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("enviar avaliação", error)}`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=avaliado`);
}

/** Pap03 "Contestar": a papelaria abre a contestação dentro do prazo de 72h. */
export async function openDisputeAction(formData: FormData): Promise<void> {
  const code = text(formData, "code");
  const back = `/papelaria/leads/${code}`;
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  try {
    await getConversionService().openDispute(actor, { leadId: text(formData, "leadId"), reason: text(formData, "reason"), detail: text(formData, "detail") || null });
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("abrir contestação", error)}`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=contestado`);
}

/** Admin12: aceitar (estorna o crédito) ou rejeitar a contestação. */
export async function resolveDisputeAction(formData: FormData): Promise<void> {
  const back = "/admin/contestacoes";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  try {
    await getConversionService().resolveDispute(actor, {
      disputeId: text(formData, "disputeId"),
      decision: text(formData, "decision"),
      reason: text(formData, "reason"),
    });
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("resolver contestação", error)}`);
  }
  revalidatePath(back);
  revalidatePath("/admin/auditoria");
  redirect(`${back}?ok=1`);
}

/** Admin (moderação): oculta uma avaliação publicada, com motivo de lista fechada (nunca texto livre). */
export async function hideReviewAction(formData: FormData): Promise<void> {
  const back = "/admin/auditoria";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  try {
    await getConversionService().hideReview(actor, { reviewId: text(formData, "reviewId"), reason: text(formData, "reason") });
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("ocultar avaliação", error)}`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=oculta`);
}
