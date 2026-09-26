"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";

import { b2bServiceErrorCode } from "./messages";
import { getB2bService } from "./wiring";

// Server Actions do admin (Admin15 `/admin/parceiros/[id]`). Conferido pelo `role` da sessão E, de novo, dentro da
// função SQL (`profiles.role = 'admin'` e o `sub` do JWT quando houver) — defesa em profundidade.

function logAndCode(what: string, error: unknown): string {
  const code = b2bServiceErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

/** Aprovar (sandbox/active), recusar ou suspender/reativar. `raw` chega da tela de decisão (plano, cobertura,
 * limites, motivo conforme o destino; ver `DecidePartnerInputSchema`). */
export async function decidePartnerAction(partnerId: string, raw: Record<string, unknown>): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(`/admin/parceiros/${partnerId}`)}`);
  try {
    await getB2bService().decidePartner(actor, partnerId, raw);
  } catch (error) {
    redirect(`/admin/parceiros/${partnerId}?erro=${logAndCode("decidir parceiro", error)}`);
  }
  revalidatePath("/admin/parceiros");
  revalidatePath(`/admin/parceiros/${partnerId}`);
  redirect(`/admin/parceiros/${partnerId}?ok=1`);
}

export async function adminRevokeKeyAction(partnerId: string, keyId: string, reason?: string): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(`/admin/parceiros/${partnerId}`)}`);
  try {
    await getB2bService().adminRevokeKey(actor, keyId, reason);
  } catch (error) {
    redirect(`/admin/parceiros/${partnerId}?erro=${logAndCode("revogar chave (admin)", error)}`);
  }
  revalidatePath(`/admin/parceiros/${partnerId}`);
  redirect(`/admin/parceiros/${partnerId}?ok=chave-revogada`);
}
