"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/stationeries/actor";

import { billingErrorCode } from "./messages";
import { getBillingService } from "./wiring";

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function logAndCode(what: string, error: unknown): string {
  const code = billingErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

/**
 * Ator da sessão, só `stationery_member` (revisão de segurança: admin NUNCA gera cobrança/compra em nome de uma
 * papelaria que não é dele — mesmo que `billing_check_member`, no banco, já recuse por falta de vínculo na imensa
 * maioria dos casos, aqui é defesa em profundidade contra o caso raro de um perfil admin que também é membro).
 */
async function requireMemberActor(stationeryId: string) {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent("/papelaria/creditos")}`);
  if (actor.role !== "stationery_member") redirect("/403");
  return { actor, back: `/papelaria/creditos`, stationeryId };
}

const idempotencyKeySchema = z.uuid();

/** Compra de pacote de crédito: gera (ou reusa) a fatura e, se Pix, a cobrança. */
export async function buyPackageAction(formData: FormData): Promise<void> {
  const stationeryId = text(formData, "stationeryId");
  const { actor, back } = await requireMemberActor(stationeryId);
  // chave gerada UMA VEZ pela página (campo oculto) e reenviada em cada tentativa: um duplo clique reenvia a MESMA
  // chave, e billing_create_package_invoice devolve a fatura já existente em vez de criar uma segunda.
  const idempotencyKey = idempotencyKeySchema.safeParse(text(formData, "idempotencyKey"));
  if (!idempotencyKey.success) redirect(`${back}?erro=invalid_input`);
  let invoiceId: string;
  try {
    const result = await getBillingService().buyPackage(actor, {
      stationeryId,
      packageId: text(formData, "packageId"),
      idempotencyKey: idempotencyKey.data,
      termsAccepted: formData.get("termsAccepted") === "on",
    });
    invoiceId = result.invoiceId;
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("comprar pacote", error)}`);
  }
  revalidatePath("/papelaria/creditos");
  redirect(`/papelaria/creditos/faturas/${invoiceId}`);
}

/** Assinatura do passe de temporada. */
export async function buyPassAction(formData: FormData): Promise<void> {
  const stationeryId = text(formData, "stationeryId");
  const { actor, back } = await requireMemberActor(stationeryId);
  const installments = z.coerce.number().int().min(1).max(3).safeParse(text(formData, "installments"));
  if (!installments.success) redirect(`${back}?erro=invalid_input`);
  const idempotencyKey = idempotencyKeySchema.safeParse(text(formData, "idempotencyKey"));
  if (!idempotencyKey.success) redirect(`${back}?erro=invalid_input`);
  let invoiceId: string;
  try {
    const result = await getBillingService().buyPass(actor, {
      stationeryId,
      installments: installments.data,
      idempotencyKey: idempotencyKey.data,
      termsAccepted: formData.get("termsAccepted") === "on",
    });
    invoiceId = result.invoiceId;
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("assinar passe", error)}`);
  }
  revalidatePath("/papelaria/creditos");
  redirect(`/papelaria/creditos/faturas/${invoiceId}`);
}

/** "Pagar com Pix" numa fatura já existente (regenera a cobrança se vencida). */
export async function payInvoiceAction(formData: FormData): Promise<void> {
  const stationeryId = text(formData, "stationeryId");
  const invoiceId = text(formData, "invoiceId");
  const { actor } = await requireMemberActor(stationeryId);
  try {
    await getBillingService().payInvoice(actor, { stationeryId, invoiceId });
  } catch (error) {
    redirect(`/papelaria/creditos/faturas/${invoiceId}?erro=${logAndCode("gerar cobrança Pix", error)}`);
  }
  revalidatePath(`/papelaria/creditos/faturas/${invoiceId}`);
  redirect(`/papelaria/creditos/faturas/${invoiceId}`);
}

/** "Simular pagamento (demonstração)": só carteira demo, confirma direto. */
export async function simulateDemoPaymentAction(formData: FormData): Promise<void> {
  const stationeryId = text(formData, "stationeryId");
  const invoiceId = text(formData, "invoiceId");
  const { actor } = await requireMemberActor(stationeryId);
  try {
    await getBillingService().simulateDemoPayment(actor, { stationeryId, invoiceId });
  } catch (error) {
    redirect(`/papelaria/creditos/faturas/${invoiceId}?erro=${logAndCode("simular pagamento", error)}`);
  }
  revalidatePath("/papelaria/creditos");
  revalidatePath(`/papelaria/creditos/faturas/${invoiceId}`);
  redirect(`/papelaria/creditos/faturas/${invoiceId}?ok=1`);
}
