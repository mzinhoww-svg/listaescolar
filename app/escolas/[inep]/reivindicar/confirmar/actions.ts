"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { serviceClaimsRepository } from "@/features/claims/action-support";
import { failed, ok, type ClaimActionState } from "@/features/claims/form-state";
import { CONFIRM_MESSAGE, ROLE_BLOCK_MESSAGE, errorMessage } from "@/features/claims/messages";
import { confirmInputSchema, inepSchema } from "@/features/claims/schemas";

/**
 * Confirmação do canal (token do e-mail ou código do WhatsApp). O GET da página NÃO consome: só esta ação, com a
 * sessão do próprio reivindicante. Resultado do banco vira texto fixo; token errado nunca vira erro técnico.
 */
export async function confirmTokenAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const inep = inepSchema.safeParse(formData.get("inep"));
  if (!inep.success) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(`/escolas/${inep.data}/reivindicar`)}`);
  if (actor.role !== "parent" && actor.role !== "school_member") return failed(ROLE_BLOCK_MESSAGE);

  const channel = formData.get("channel");
  const parsed = confirmInputSchema.safeParse(
    channel === "whatsapp"
      ? { channel, claimId: formData.get("claimId"), code: formData.get("code") }
      : { channel: "email", token: formData.get("token") },
  );
  if (!parsed.success) return failed(CONFIRM_MESSAGE.invalid);
  try {
    const result = await serviceClaimsRepository().confirmToken(actor, parsed.data);
    revalidatePath(`/escolas/${inep.data}`);
    revalidatePath(`/escolas/${inep.data}/reivindicar`);
    return result === "confirmed" || result === "already_confirmed" ? ok(CONFIRM_MESSAGE[result]) : failed(CONFIRM_MESSAGE[result]);
  } catch (error) {
    console.error("confirmar token", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
}
