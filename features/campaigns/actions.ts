"use server";

import { revalidatePath } from "next/cache";

import { getSessionActor } from "@/features/auth/actor";
import { flagOn } from "@/lib/feature-flags";

import { campaignServiceErrorCode, campaignServiceMessage } from "./messages";
import type { CreateCampaignInput, OwnerTransitionInput, SubmitCampaignInput } from "./schemas";
import { getCampaignService, getInsightsService, getStatementService, myPartnerId } from "./wiring";
import type { InsightsQueryInput } from "./schemas";
import type { DisplayStatement } from "./statement-service";
import type { InsightsResult } from "./insights-service";

// Server Actions finas do portal (dono, B2B06/B2B07/B2B08/B2B09). Autorização final é do banco; aqui só validação
// de fronteira (Zod, dentro dos serviços) e o mapeamento de erro — mesmo padrão de features/b2b/actions.ts.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** Campanhas B2B pagas: desligadas por padrão (B2B_CAMPAIGNS_ENABLED=1). Escrita barrada com mensagem "indisponível". */
const CAMPAIGNS_OFF = { ok: false as const, code: "unavailable", message: "Campanhas estão indisponíveis no momento." };
const campaignsOff = (): boolean => !flagOn(process.env, "b2bCampaigns");

function logAndCode(what: string, error: unknown): string {
  const code = campaignServiceErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  return promise.then(
    (data) => ({ ok: true as const, data }),
    (error) => {
      const code = logAndCode("ação de campanha", error);
      return { ok: false as const, code, message: campaignServiceMessage(code) ?? "Não foi possível concluir agora." };
    },
  );
}

/** B2B07: cria a campanha (nasce `draft`). */
export async function createCampaignAction(input: CreateCampaignInput): Promise<ActionResult<{ campaignId: string }>> {
  if (campaignsOff()) return CAMPAIGNS_OFF;
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getCampaignService().createCampaign(actor, input));
  if (result.ok) revalidatePath("/b2b/campanhas");
  return result;
}

/** B2B06/B2B07: envia para aprovação do admin (`draft` -> `pending_review`). */
export async function submitCampaignAction(input: SubmitCampaignInput): Promise<ActionResult<void>> {
  if (campaignsOff()) return CAMPAIGNS_OFF;
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getCampaignService().submitCampaign(actor, input));
  if (result.ok) revalidatePath("/b2b/campanhas");
  return result;
}

/** B2B06: pausar ou concluir a própria campanha. */
export async function ownerTransitionCampaignAction(input: OwnerTransitionInput): Promise<ActionResult<void>> {
  if (campaignsOff()) return CAMPAIGNS_OFF;
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getCampaignService().ownerTransition(actor, input));
  if (result.ok) revalidatePath("/b2b/campanhas");
  return result;
}

/** B2B06: retomar campanha pausada (recusado pelo banco se o orçamento total já se esgotou). */
export async function resumeCampaignAction(input: { campaignId: string }): Promise<ActionResult<void>> {
  if (campaignsOff()) return CAMPAIGNS_OFF;
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getCampaignService().resumeCampaign(actor, input));
  if (result.ok) revalidatePath("/b2b/campanhas");
  return result;
}

/** B2B06: lista as campanhas do parceiro do ator logado (vazio sem parceiro). */
export async function listMyCampaignsAction(): Promise<ActionResult<Awaited<ReturnType<ReturnType<typeof getCampaignService>["listMyCampaigns"]>>>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const partnerId = await myPartnerId(actor);
  if (!partnerId) return { ok: true, data: [] };
  return toResult(getCampaignService().listMyCampaigns(partnerId));
}

/** B2B08: insights agregados com k-anonimato, do ambiente (demo/real) do próprio parceiro marca. */
export async function queryInsightsAction(input: InsightsQueryInput): Promise<ActionResult<InsightsResult>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  return toResult(getInsightsService().query(actor, input));
}

/** B2B09: extratos do próprio parceiro, já formatados para exibição ("indisponível" quando sem preço). */
export async function listMyStatementsAction(): Promise<ActionResult<DisplayStatement[]>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const partnerId = await myPartnerId(actor);
  if (!partnerId) return { ok: true, data: [] };
  return toResult(getStatementService().listForPartner(actor, partnerId));
}
