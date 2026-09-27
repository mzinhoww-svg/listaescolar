"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { signOut } from "@/features/auth/actions";
import { deleteAccount } from "@/features/privacy/repository";
import { revokeMyConsent } from "@/features/privacy/queries";
import { consentIdInputSchema, deleteAccountInputSchema } from "@/features/privacy/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/conta/privacidade";

export type DeleteAccountResult = { status: "ok" } | { status: "error"; message: string };

async function actorOrLogin(): Promise<SessionActor> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(PATH)}`);
  return actor;
}

/** Revogar um consentimento próprio (o `profile_id` vem SÓ da sessão, nunca do formulário). */
export async function revokeConsentAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const parsed = consentIdInputSchema.safeParse(formData.get("id"));
  if (!parsed.success) return;
  await revokeMyConsent(createAdminClient(), parsed.data, actor.userId).catch(() => undefined);
  revalidatePath(PATH);
}

/**
 * Excluir conta (LGPD): exige digitar a palavra de confirmação. Apaga o que é pessoal, anonimiza o que precisa
 * ficar por obrigação (ver `features/privacy/repository.ts` e o Ruling do ledger "S17"), e sai da sessão.
 */
export async function deleteAccountAction(_prev: DeleteAccountResult, formData: FormData): Promise<DeleteAccountResult> {
  const actor = await actorOrLogin();
  const parsed = deleteAccountInputSchema.safeParse({ confirmation: formData.get("confirmation") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Confirmação inválida." };
  }
  try {
    await deleteAccount(createAdminClient(), actor.userId);
  } catch {
    return { status: "error", message: "Não foi possível excluir a conta agora. Tente novamente." };
  }
  await signOut(); // redireciona para /entrar
  return { status: "ok" };
}
