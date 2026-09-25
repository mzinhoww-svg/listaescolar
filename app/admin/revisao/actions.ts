"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { REJECT_REASONS } from "@/features/review/codes";
import { buildReviewService } from "@/features/review/deps";
import { ReviewError } from "@/features/review/errors";
import { blockerPhrase, reasonPhrase } from "@/features/review/phrases";
import { assignSchoolSchema, reviewPayloadSchema, submissionIdSchema } from "@/features/review/schemas";
import type { PublishOutcome, ReviewOutcome } from "@/features/review/types";

import { state, type ReviewActionState } from "./state";

const LIST = "/admin/revisao";
const ADMIN_ONLY = "Esta ação é só para administradores.";
const STALE = "Esta lista foi alterada por outra pessoa ou em outra aba. Recarregue para ver a versão mais recente antes de decidir.";
const GENERIC = "Não foi possível concluir. Tente de novo.";
const NOT_REVIEWABLE = "Este envio não está mais em revisão.";
const INVALID = "Confira os campos: nome de 1 a 300 caracteres, quantidade de 1 a 9999, série da lista e ano válido.";

type Guard = { actor: SessionActor; id: string } | ReviewActionState;
const isState = (g: Guard): g is ReviewActionState => "kind" in g;

/** Sessão obrigatória (login), papel admin e id válido. O `actor_id` vem SÓ da sessão: nenhum campo do formulário o define. */
async function guard(formData: FormData): Promise<Guard> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(LIST)}`);
  if (actor.role !== "admin") return state("error", ADMIN_ONLY);
  const id = submissionIdSchema.safeParse(formData.get("submissionId"));
  return id.success ? { actor, id: id.data } : state("error", GENERIC);
}

function refresh(id: string): void {
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
}

const fail = (e: unknown): ReviewActionState => {
  if (e instanceof ReviewError) {
    if (e.code === "forbidden") return state("error", ADMIN_ONLY);
    if (e.code === "invalid_input") return state("error", INVALID);
    if (e.code === "not_found") return state("error", "Envio não encontrado.");
  }
  console.error("revisão humana", e instanceof Error ? e.name : "erro");
  return state("error", GENERIC);
};

function approvalProblem(a: ReviewOutcome): ReviewActionState | null {
  if (a.status === "stale") return state("stale", STALE);
  if (a.status === "not_reviewable") return state("error", NOT_REVIEWABLE);
  if (a.status === "blocked") return state("blocked", `Ainda há pendências: ${a.codes.map(blockerPhrase).join(" ")}`);
  return null;
}

function publicationState(p: PublishOutcome | null): ReviewActionState {
  if (!p) return state("approved", "Lista aprovada.");
  switch (p.status) {
    case "published":
      return state("published", "Lista publicada.");
    case "publish_pending":
      return state("pending", "Lista aprovada; a publicação ainda não terminou. Use “Tentar publicar de novo”.");
    case "publish_unavailable":
      return state("unavailable", "Lista aprovada. Publicação indisponível neste ambiente até a integração.");
    case "publish_failed":
      return state("failed", `A publicação falhou e o envio voltou à fila. ${reasonPhrase(p.code)}.`);
    case "orphaned":
      return state("error", "Lista aprovada; publicação bloqueada: existe uma publicação automática não reconciliada. Use “Conciliar publicação”.");
    case "not_reviewable":
      return state("error", NOT_REVIEWABLE);
  }
}

/** Salva a edição como nova versão. O payload é JSON (lista inteira + versão esperada) e passa pelo Zod antes do serviço. */
export async function saveReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const g = await guard(formData);
  if (isState(g)) return g;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return state("error", INVALID);
  }
  const parsed = reviewPayloadSchema.safeParse(raw);
  if (!parsed.success) return state("error", INVALID);
  try {
    const r = await buildReviewService().save(g.actor, g.id, parsed.data);
    // stale/not_reviewable NÃO revalidam: a página não re-renderiza com a versão nova e o rascunho do admin fica intacto.
    if (r.status === "saved") {
      refresh(g.id);
      return state("saved", `Edição salva (versão ${r.version}).`);
    }
    if (r.status === "stale") return state("stale", STALE);
    return state("error", NOT_REVIEWABLE);
  } catch (e) {
    return fail(e);
  }
}

const versionOf = (f: FormData): number => Number(f.get("expectedVersion"));
const ackOf = (f: FormData): boolean => f.get("acknowledged") === "on" || f.get("acknowledged") === "true";

/** Aprova e publica pela porta; cada resultado tem a sua frase. Bloqueio ou versão velha não publica. */
export async function approveAndPublishAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const g = await guard(formData);
  if (isState(g)) return g;
  try {
    const r = await buildReviewService().approveAndPublish(g.actor, g.id, { expectedVersion: versionOf(formData), acknowledged: ackOf(formData) });
    const problem = approvalProblem(r.approval);
    if (problem) return problem; // stale, bloqueio e não revisável: sem revalidar (o rascunho não se perde)
    refresh(g.id);
    return publicationState(r.publication);
  } catch (e) {
    return fail(e);
  }
}

/** Tenta de novo a publicação de um envio já aprovado pela equipe. */
export async function publishAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const g = await guard(formData);
  if (isState(g)) return g;
  try {
    const p = await buildReviewService().publish(g.actor, g.id);
    if (p.status !== "not_reviewable") refresh(g.id);
    return publicationState(p);
  } catch (e) {
    return fail(e);
  }
}

/** Recusa com motivo de lista fechada (sem texto livre: poderia carregar dado de menor). */
export async function rejectAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const g = await guard(formData);
  if (isState(g)) return g;
  const reason = String(formData.get("reason") ?? "");
  if (!(REJECT_REASONS as readonly string[]).includes(reason)) return state("error", "Escolha um motivo da lista.");
  try {
    const r = await buildReviewService().reject(g.actor, g.id, { reason, expectedVersion: versionOf(formData) });
    if (r.status === "rejected") {
      refresh(g.id);
      return state("rejected", "Lista recusada.");
    }
    if (r.status === "stale") return state("stale", STALE);
    return state("error", NOT_REVIEWABLE);
  } catch (e) {
    return fail(e);
  }
}

/** Atribui a escola a um envio sem escola. A escola vem do seletor (id); o `actor_id` vem só da sessão. */
export async function assignSchoolAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const g = await guard(formData);
  if (isState(g)) return g;
  const parsed = assignSchoolSchema.safeParse({ schoolId: formData.get("schoolId"), expectedVersion: versionOf(formData) });
  if (!parsed.success) return state("error", "Escolha uma escola da lista.");
  try {
    const r = await buildReviewService().assignSchool(g.actor, g.id, parsed.data);
    if (r.status === "school_assigned") {
      refresh(g.id);
      return state("assigned", "Escola atribuída ao envio.");
    }
    if (r.status === "stale") return state("stale", STALE);
    return state("error", "Este envio não aceita atribuição de escola (já tem escola ou não está em revisão).");
  } catch (e) {
    return fail(e);
  }
}

/** "Conciliar publicação" (D-066): o admin confere e concilia; nada é vinculado sozinho. */
export async function reconcileAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const g = await guard(formData);
  if (isState(g)) return g;
  try {
    const r = await buildReviewService().reconcile(g.actor, g.id);
    refresh(g.id);
    if (r === "reconciled") return state("reconciled", "Publicação conciliada: a versão publicada foi vinculada e o envio está publicado.");
    if (r === "orphan_not_found") return state("reconciled", "Não encontramos a versão publicada deste envio. A publicação humana está liberada.");
    return state("error", "Não há publicação pendente de conciliação.");
  } catch (e) {
    return fail(e);
  }
}
