"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/stationeries/actor";

import { parsePercentToBps } from "./bps";
import { payoutErrorCode } from "./messages";
import { PIX_KEY_KINDS, type PixKeyKind } from "./ports";
import { getPayoutService } from "./wiring";

const ADMIN_BACK = "/admin/repasses";

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function intOrNaN(v: string): number {
  const n = Number(v);
  return Number.isInteger(n) ? n : Number.NaN;
}

function logAndCode(what: string, error: unknown): string {
  const code = payoutErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

async function requireAdminActor(back: string) {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  if (actor.role !== "admin") redirect("/403");
  return actor;
}

/** Admin13: publica a comissão vigente e os prazos de inadimplência (uma versão ativa por vez). */
export async function publishPayoutSettingsAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(ADMIN_BACK);
  const commissionBps = parsePercentToBps(text(formData, "commissionPercent"));
  try {
    await getPayoutService().publishSettings(actor, {
      commissionBps: commissionBps ?? Number.NaN,
      graceDays: intOrNaN(text(formData, "graceDays")),
      blockDays: intOrNaN(text(formData, "blockDays")),
    });
  } catch (error) {
    redirect(`${ADMIN_BACK}?erro=${logAndCode("publicar comissão", error)}`);
  }
  revalidatePath(ADMIN_BACK);
  revalidatePath("/admin/inadimplencia");
  redirect(`${ADMIN_BACK}?ok=comissao`);
}

/** Admin13: publica o repasse de uma escola/APM (alvo `none` limpa o repasse). */
export async function publishSchoolPayoutConfigAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(ADMIN_BACK);
  const target = text(formData, "target");
  const pixKeyKindRaw = text(formData, "pixKeyKind");
  const pixKeyKind: PixKeyKind | null = (PIX_KEY_KINDS as readonly string[]).includes(pixKeyKindRaw) ? (pixKeyKindRaw as PixKeyKind) : null;
  const payoutBps = target === "none" ? 0 : (parsePercentToBps(text(formData, "payoutPercent")) ?? Number.NaN);
  try {
    await getPayoutService().publishSchoolConfig(actor, {
      schoolId: text(formData, "schoolId"),
      target,
      payoutBps,
      beneficiaryName: text(formData, "beneficiaryName") || null,
      pixKey: text(formData, "pixKey") || null,
      pixKeyKind,
    });
  } catch (error) {
    redirect(`${ADMIN_BACK}?erro=${logAndCode("publicar repasse de escola", error)}`);
  }
  revalidatePath(ADMIN_BACK);
  redirect(`${ADMIN_BACK}?ok=escola`);
}

/**
 * Confirma "Pix pela plataforma" para uma venda (Pap03/Admin13): registro declarativo, sem cobrar nem transferir
 * nada — só gera comissão/repasse no livro-razão. Volta para onde a papelaria/admin estava.
 */
export async function confirmSaleAction(formData: FormData): Promise<void> {
  const back = text(formData, "back") || "/papelaria/leads";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  const schoolId = text(formData, "schoolId");
  try {
    await getPayoutService().confirmSale(actor, { leadId: text(formData, "leadId"), schoolId: schoolId || null });
  } catch (error) {
    redirect(`${back}?erro=${logAndCode("confirmar Pix pela plataforma", error)}`);
  }
  revalidatePath(back);
  revalidatePath(ADMIN_BACK);
  redirect(`${back}?ok=venda_confirmada`);
}

/** Admin13: gera o lote de pagamento (instrução) para uma escola/APM com repasse pendente. */
export async function createPayoutBatchAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(ADMIN_BACK);
  try {
    await getPayoutService().createBatch(actor, { schoolId: text(formData, "schoolId"), beneficiaryType: text(formData, "beneficiaryType") });
  } catch (error) {
    redirect(`${ADMIN_BACK}?erro=${logAndCode("gerar lote de repasse", error)}`);
  }
  revalidatePath(ADMIN_BACK);
  redirect(`${ADMIN_BACK}?ok=lote`);
}

/** Admin13: marca um lote como executado (a transferência de verdade já foi feita manualmente fora do sistema). */
export async function markPayoutBatchExecutedAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(ADMIN_BACK);
  try {
    await getPayoutService().markBatchExecuted(actor, { batchId: text(formData, "batchId") });
  } catch (error) {
    redirect(`${ADMIN_BACK}?erro=${logAndCode("marcar lote como executado", error)}`);
  }
  revalidatePath(ADMIN_BACK);
  redirect(`${ADMIN_BACK}?ok=executado`);
}
