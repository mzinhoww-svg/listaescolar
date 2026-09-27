"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOut } from "@/features/auth/actions";
import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { getCurrentUser } from "@/features/auth/queries";
import { PrivacyError } from "@/features/privacy/errors";
import { deleteAccount } from "@/features/privacy/repository";
import { REVOCABLE_CONSENT_PURPOSES, revokeMyConsent } from "@/features/privacy/queries";
import { consentIdInputSchema, deleteAccountInputSchema } from "@/features/privacy/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATH = "/conta/privacidade";
/** Ação irreversível: exige sessão reautenticada há pouco tempo (link mágico recente), além da confirmação
 * digitada (Revisão de segurança/privacidade). */
const REAUTH_WINDOW_MS = 15 * 60 * 1000;

export type DeleteAccountResult = { status: "ok" } | { status: "error"; message: string };

const DELETION_BLOCKER_MESSAGE: Record<string, string> = {
  stationery_owner: "Você é a única responsável por um cadastro de papelaria. Transfira o cadastro para outra pessoa ou peça o encerramento antes de excluir sua conta.",
  b2b_partner_owner: "Você é a única responsável por um parceiro do portal B2B. Transfira o cadastro para outra pessoa ou peça o encerramento antes de excluir sua conta.",
  review_history: "Sua conta tem histórico de revisão administrativa de listas, que não pode ser removido. Fale com o suporte para excluir sua conta.",
};

async function actorOrLogin(): Promise<SessionActor> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(PATH)}`);
  return actor;
}

/** Revogar um consentimento próprio (o `profile_id` vem SÓ da sessão, nunca do formulário). Recusa finalidades
 * contratuais (`billing_terms`, `b2b_api_terms`) mesmo que o botão tenha sido forjado — defesa em profundidade,
 * a tela já não mostra "Revogar" para elas. */
export async function revokeConsentAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const parsed = consentIdInputSchema.safeParse(formData.get("id"));
  if (!parsed.success) return;
  const session = await createClient();
  const { data } = await session.from("consents").select("purpose").eq("id", parsed.data).maybeSingle();
  const purpose = typeof data?.purpose === "string" ? data.purpose : null;
  if (!purpose || !(REVOCABLE_CONSENT_PURPOSES as readonly string[]).includes(purpose)) return;
  await revokeMyConsent(createAdminClient(), parsed.data, actor.userId).catch(() => undefined);
  revalidatePath(PATH);
}

function messageForError(e: unknown): string {
  if (e instanceof PrivacyError && e.code in DELETION_BLOCKER_MESSAGE) return DELETION_BLOCKER_MESSAGE[e.code]!;
  return "Não foi possível excluir a conta agora. Tente novamente.";
}

/**
 * Excluir conta (LGPD): exige sessão reautenticada há pouco tempo, a palavra de confirmação, e nenhum vínculo
 * bloqueante (única dona de papelaria/parceiro B2B, histórico de curadoria administrativa). Apaga o que é
 * pessoal, anonimiza o que precisa ficar por registro que mantemos (ver `features/privacy/repository.ts` e o
 * Ruling do ledger "S17"), e sai da sessão.
 */
export async function deleteAccountAction(_prev: DeleteAccountResult, formData: FormData): Promise<DeleteAccountResult> {
  const actor = await actorOrLogin();
  const parsed = deleteAccountInputSchema.safeParse({ confirmation: formData.get("confirmation") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Confirmação inválida." };
  }
  const user = await getCurrentUser();
  const lastSignIn = user?.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : NaN;
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > REAUTH_WINDOW_MS) {
    return {
      status: "error",
      message: "Sua sessão precisa ser recente para excluir a conta. Saia, entre de novo pelo link mágico e tente outra vez.",
    };
  }
  try {
    await deleteAccount(createAdminClient(), actor.userId);
  } catch (e) {
    return { status: "error", message: messageForError(e) };
  }
  await signOut(); // redireciona para /entrar
  return { status: "ok" };
}
