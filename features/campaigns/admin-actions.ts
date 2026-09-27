"use server";

import { revalidatePath } from "next/cache";

import { getSessionActor } from "@/features/auth/actor";

import { campaignServiceErrorCode, campaignServiceMessage } from "./messages";
import type { ActionResult } from "./actions";
import type { DecideCampaignInput, GenerateStatementInput, InsightsQueryInput, SetMinKInput } from "./schemas";
import { getCampaignService, getInsightsService, getStatementService, setInsightsMinK } from "./wiring";
import type { CampaignRow } from "./repository";
import type { InsightsResult } from "./insights-service";

// Server Actions do admin (Admin16: fila de aprovação com checagem Procon; configuração de k-anonimato; geração
// de extrato). Autorização final é do banco + `requireAdmin` no serviço — mesmo padrão de features/b2b/admin-actions.

function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  return promise.then(
    (data) => ({ ok: true as const, data }),
    (error) => {
      const code = campaignServiceErrorCode(error);
      console.error("ação admin de campanha", error instanceof Error ? `${error.name}: ${error.message}` : "erro");
      return { ok: false as const, code, message: campaignServiceMessage(code) ?? "Não foi possível concluir agora." };
    },
  );
}

/** Admin16: fila de campanhas pendentes de aprovação. */
export async function listPendingCampaignsAction(): Promise<ActionResult<CampaignRow[]>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  return toResult(getCampaignService().listPendingReview(actor));
}

/** Admin16: aprova ou rejeita (motivo obrigatório para rejeitar). */
export async function decideCampaignAction(input: DecideCampaignInput): Promise<ActionResult<void>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getCampaignService().decideCampaign(actor, input));
  if (result.ok) revalidatePath("/admin/campanhas");
  return result;
}

/** Configura o k mínimo dos insights (padrão 5). */
export async function setMinKAction(input: SetMinKInput): Promise<ActionResult<number>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  if (actor.role !== "admin") return { ok: false, code: "forbidden", message: "Só admin configura." };
  return toResult(setInsightsMinK(actor, input.minK));
}

/** Admin: consulta insights escolhendo o ambiente (demo/real) explicitamente. */
export async function queryInsightsAsAdminAction(input: InsightsQueryInput, isDemo: boolean): Promise<ActionResult<InsightsResult>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  return toResult(getInsightsService().queryAsAdmin(actor, input, isDemo));
}

/** Gera o extrato imutável do período (nunca cobra automaticamente; só o registro + instrução manual). */
export async function generateStatementAction(input: GenerateStatementInput): Promise<ActionResult<{ statementId: string }>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getStatementService().generate(actor, input));
  if (result.ok) revalidatePath("/b2b/faturamento");
  return result;
}
