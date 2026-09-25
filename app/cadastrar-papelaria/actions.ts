"use server";

import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/stationeries/actor";
import { readValues, validateRegistration, type RegisterState } from "@/features/stationeries/form-data";
import { repositoryErrorMessage, ROLE_BLOCK_MESSAGE } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { registerStationery } from "@/features/stationeries/repository";
import { submitForReview } from "@/features/stationeries/submit";
import { canSubmitForReview } from "@/features/stationeries/submit-rules";
import { createAdminClient } from "@/lib/supabase/admin";

const NEXT = "/cadastrar-papelaria";

/**
 * Cadastro da papelaria. Só o papel `parent` cadastra (a aprovação promove `parent` a `stationery_member`).
 * O dono é sempre o ator da sessão (`getSessionActor`); o cliente de serviço só entra depois de validar sessão,
 * papel e entrada. O aceite LGPD é obrigatório e a versão do texto é constante do servidor.
 */
export async function registerStationeryAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(NEXT)}`);
  const values = readValues(formData);
  const fail = (message: string, errors: Record<string, string> = {}): RegisterState => ({ status: "error", message, errors, values });

  if (actor.role !== "parent") return fail(ROLE_BLOCK_MESSAGE);
  const parsed = validateRegistration(formData);
  if (!parsed.ok) return fail("Revise os campos destacados.", parsed.errors);

  const admin = createAdminClient();
  const municipality = await admin
    .from("municipalities")
    .select("id")
    .eq("id", parsed.data.basics.municipalityId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (municipality.error || !municipality.data) return fail("Este município ainda não está habilitado.", { municipalityId: "Selecione um município habilitado." });

  let created: { id: string; created: boolean };
  try {
    created = await registerStationery(admin, actor, parsed.data);
  } catch (error) {
    console.error("cadastrar papelaria", error);
    const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "cnpj_taken") return fail(repositoryErrorMessage(error), { cnpj: "Já existe uma papelaria com este CNPJ." });
    return fail(repositoryErrorMessage(error));
  }
  // duplo envio: a papelaria já existia; a página de credenciamento mostra o estado (nada é reenviado daqui).
  if (!created.created) redirect(NEXT);
  try {
    await submitForReview(admin, actor, { id: created.id, from: "signup" });
  } catch (error) {
    // O cadastro ficou salvo; a página de credenciamento oferece o reenvio.
    console.error("enviar para análise", error);
    redirect(`${NEXT}?erro=envio`);
  }
  redirect(NEXT);
}

/** Reenvia o cadastro à análise (signup/accreditation/rejected → under_review). Dono = sessão. */
export async function resubmitAction(): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(NEXT)}`);
  if (actor.role !== "parent" && actor.role !== "stationery_member") redirect(NEXT);
  const own = await getStationeryOfOwner(actor.userId);
  if (!own || !canSubmitForReview(own.status)) redirect(NEXT);
  try {
    await submitForReview(createAdminClient(), actor, { id: own.id, from: own.status });
  } catch (error) {
    console.error("reenviar para análise", error);
    redirect(`${NEXT}?erro=envio`);
  }
  redirect(NEXT);
}
