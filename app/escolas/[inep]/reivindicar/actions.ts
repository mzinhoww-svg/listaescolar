"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { envSenderFor, linkOrigin, loginPath, serviceClaimsRepository } from "@/features/claims/action-support";
import { failed, ok, type ClaimActionState } from "@/features/claims/form-state";
import { ROLE_BLOCK_MESSAGE, errorMessage } from "@/features/claims/messages";
import { getSchoolClaimContext } from "@/features/claims/queries";
import { MAX_EVIDENCE_BYTES } from "@/features/claims/files";
import { createClaimInputSchema, evidenceNoteSchema, inepSchema, uuidSchema } from "@/features/claims/schemas";

/**
 * Fluxo do reivindicante. Toda ação: `inep` validado, sessão (`getSessionActor`), papel `parent|school_member`;
 * o ator vem SÓ da sessão e o service role só entra depois disso. Erros viram texto fixo (`messages.ts`).
 */
async function gate(formData: FormData) {
  const inep = inepSchema.safeParse(formData.get("inep"));
  if (!inep.success) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect(loginPath(inep.data));
  const blocked = actor.role !== "parent" && actor.role !== "school_member";
  return { inep: inep.data, actor, blocked };
}

const refresh = (inep: string) => {
  revalidatePath(`/escolas/${inep}`);
  revalidatePath(`/escolas/${inep}/reivindicar`);
};

function issuesToErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const i of issues) errors[String(i.path[0] ?? "form")] ??= "Revise este campo.";
  return errors;
}

export async function createClaimAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const { inep, actor, blocked } = await gate(formData);
  if (blocked) return failed(ROLE_BLOCK_MESSAGE);
  const parsed = createClaimInputSchema.safeParse({
    method: formData.get("method"),
    claimantName: formData.get("claimantName"),
    claimantRoleTitle: formData.get("claimantRoleTitle"),
    evidenceNote: formData.get("evidenceNote") ?? undefined,
    privacyAck: formData.get("privacyAck") ?? undefined,
  });
  if (!parsed.success) return failed("Revise os campos destacados.", issuesToErrors(parsed.error.issues));
  const context = await getSchoolClaimContext(inep);
  if (!context) notFound();
  if (context.blockedReason) return failed(context.blockedReason);
  const availability = context.methods[parsed.data.method];
  if (!availability.available) return failed(availability.reason, { method: availability.reason });
  try {
    await serviceClaimsRepository().createClaim(actor, {
      schoolId: context.school.id,
      method: parsed.data.method,
      claimantName: parsed.data.claimantName,
      claimantRoleTitle: parsed.data.claimantRoleTitle,
      evidenceNote: parsed.data.evidenceNote,
    });
  } catch (error) {
    console.error("criar reivindicação", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
  refresh(inep);
  return ok("Pedido iniciado. Conclua as próximas etapas nesta página.");
}

export async function uploadEvidenceAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const { inep, actor, blocked } = await gate(formData);
  if (blocked) return failed(ROLE_BLOCK_MESSAGE);
  const claimId = uuidSchema.safeParse(formData.get("claimId"));
  const file = formData.get("file");
  if (!claimId.success || !(file instanceof File) || file.size === 0) return failed("Escolha um arquivo PDF, PNG ou JPEG.");
  if (file.size > MAX_EVIDENCE_BYTES) return failed(errorMessage({ code: "file_too_large" }));
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await serviceClaimsRepository().addEvidence(actor, { claimId: claimId.data, bytes, declaredMime: file.type, originalName: file.name });
  } catch (error) {
    console.error("enviar evidência", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
  refresh(inep);
  return ok("Arquivo recebido.");
}

export async function removeEvidenceAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const { inep, actor, blocked } = await gate(formData);
  if (blocked) return failed(ROLE_BLOCK_MESSAGE);
  const evidenceId = uuidSchema.safeParse(formData.get("evidenceId"));
  if (!evidenceId.success) return failed(errorMessage({ code: "invalid_argument" }));
  try {
    await serviceClaimsRepository().removeEvidence(actor, evidenceId.data);
  } catch (error) {
    console.error("remover evidência", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
  refresh(inep);
  return ok("Arquivo removido.");
}

export async function submitClaimAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const { inep, actor, blocked } = await gate(formData);
  if (blocked) return failed(ROLE_BLOCK_MESSAGE);
  const claimId = uuidSchema.safeParse(formData.get("claimId"));
  const note = evidenceNoteSchema.safeParse(formData.get("evidenceNote") ?? undefined);
  if (!claimId.success || !note.success) return failed(errorMessage({ code: "invalid_argument" }));
  try {
    await serviceClaimsRepository().submitForReview(actor, { claimId: claimId.data, evidenceNote: note.data });
  } catch (error) {
    console.error("enviar para análise", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
  refresh(inep);
  return ok("Pedido enviado para análise. Acompanhe o status nesta página.");
}

/** Pede o link (e-mail) ou o código (WhatsApp) ao contato registrado da escola. O contato nunca é exibido. */
export async function requestTokenAction(_prev: ClaimActionState, formData: FormData): Promise<ClaimActionState> {
  const { inep, actor, blocked } = await gate(formData);
  if (blocked) return failed(ROLE_BLOCK_MESSAGE);
  const claimId = uuidSchema.safeParse(formData.get("claimId"));
  if (!claimId.success) return failed(errorMessage({ code: "invalid_argument" }));
  try {
    const { channel } = await serviceClaimsRepository().issueToken(actor, { claimId: claimId.data, sender: envSenderFor, origin: linkOrigin() });
    refresh(inep);
    return ok(channel === "email" ? "Enviamos o link ao e-mail registrado da escola." : "Enviamos o código ao WhatsApp registrado da escola.");
  } catch (error) {
    console.error("emitir token", error instanceof Error ? error.message : "erro");
    return failed(errorMessage(error));
  }
}
