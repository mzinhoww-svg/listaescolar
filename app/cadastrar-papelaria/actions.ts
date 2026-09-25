"use server";

import { redirect } from "next/navigation";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
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
 * O dono é sempre o usuário da sessão; o cliente de serviço só entra depois de validar sessão, papel e entrada.
 */
export async function registerStationeryAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(NEXT)}`);
  const values = readValues(formData);
  const fail = (message: string, errors: Record<string, string> = {}): RegisterState => ({ status: "error", message, errors, values });

  if ((await getCurrentRole()) !== "parent") return fail(ROLE_BLOCK_MESSAGE);
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

  let createdId: string;
  try {
    createdId = (await registerStationery(admin, { ownerId: user.id, ...parsed.data })).id;
  } catch (error) {
    console.error("cadastrar papelaria", error);
    const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "cnpj_taken") return fail(repositoryErrorMessage(error), { cnpj: "Já existe uma papelaria com este CNPJ." });
    return fail(repositoryErrorMessage(error));
  }
  try {
    await submitForReview(admin, { id: createdId, from: "signup", actorId: user.id });
  } catch (error) {
    // O cadastro ficou salvo; a página de credenciamento oferece o reenvio.
    console.error("enviar para análise", error);
    redirect(`${NEXT}?erro=envio`);
  }
  redirect(NEXT);
}

/** Reenvia o cadastro à análise (signup/accreditation/rejected → under_review). Dono = sessão. */
export async function resubmitAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(NEXT)}`);
  const role = await getCurrentRole();
  if (role !== "parent" && role !== "stationery_member") redirect(NEXT);
  const own = await getStationeryOfOwner(user.id);
  if (!own || !canSubmitForReview(own.status)) redirect(NEXT);
  try {
    await submitForReview(createAdminClient(), { id: own.id, from: own.status, actorId: user.id });
  } catch (error) {
    console.error("reenviar para análise", error);
    redirect(`${NEXT}?erro=envio`);
  }
  redirect(NEXT);
}
