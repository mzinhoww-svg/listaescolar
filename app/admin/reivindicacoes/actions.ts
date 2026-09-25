"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { serviceClaimsRepository } from "@/features/claims/action-support";
import { failed, ok, type ClaimActionState } from "@/features/claims/form-state";
import { ADMIN_ONLY_MESSAGE, errorMessage } from "@/features/claims/messages";
import { getClaimForAdmin } from "@/features/claims/queries";
import { decisionInputSchema } from "@/features/claims/schemas";

const NEXT = "/admin/reivindicacoes";

/**
 * Decisão humana: aprovar, pedir mais evidências ou recusar (motivo obrigatório quando não aprova). Ator = admin da
 * sessão; a função SQL confere `profiles.role` de novo. Nada aqui aprova sozinho.
 */
export async function decideClaimAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(NEXT)}`);
  if (actor.role !== "admin") return failed(ADMIN_ONLY_MESSAGE);
  const parsed = decisionInputSchema.safeParse({
    claimId: formData.get("claimId"),
    to: formData.get("to"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    const needsReason = parsed.error.issues.some((i) => i.path[0] === "reason");
    return failed(needsReason ? "Informe o motivo (3 a 500 caracteres)." : "Decisão inválida.", needsReason ? { reason: "Informe o motivo (3 a 500 caracteres)." } : {});
  }
  try {
    const before = await getClaimForAdmin(actor, parsed.data.claimId);
    await serviceClaimsRepository().decide(actor, parsed.data);
    revalidatePath(NEXT);
    revalidatePath(`${NEXT}/${parsed.data.claimId}`);
    if (before) revalidatePath(`/escolas/${before.school.inep}`);
    return ok(parsed.data.to === "approved" ? "Reivindicação aprovada." : parsed.data.to === "rejected" ? "Reivindicação recusada." : "Mais evidências solicitadas.");
  } catch (error) {
    console.error("decidir reivindicação", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
}
