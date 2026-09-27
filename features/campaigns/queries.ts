import "server-only";

import type { SessionActor } from "@/features/auth/actor";

import type { CampaignRow } from "./repository";
import type { InsightsResult } from "./insights-service";
import type { DisplayStatement } from "./statement-service";
import { getCampaignService, getInsightsService, getStatementService, myPartnerId } from "./wiring";

// Leituras de servidor para as páginas do portal B2B/admin (Task 3 consome estas funções, não `repository.ts`
// direto) — mesmo padrão de `features/b2b/queries.ts`.

/** `null` quando o ator não é dono de nenhum parceiro B2B (qualquer tipo). */
export async function getMyPartnerId(actor: SessionActor): Promise<string | null> {
  return myPartnerId(actor);
}

/** B2B06: campanhas do próprio parceiro; vazio sem vínculo. */
export async function listMyCampaigns(actor: SessionActor): Promise<CampaignRow[]> {
  const partnerId = await myPartnerId(actor);
  if (!partnerId) return [];
  return getCampaignService().listMyCampaigns(partnerId);
}

/** Exige ator + posse (dono do parceiro dono da campanha, ou admin) — nunca lida sem checar quem está pedindo. */
export async function getCampaignById(actor: SessionActor, campaignId: string): Promise<CampaignRow | null> {
  return getCampaignService().getCampaignForActor(actor, campaignId);
}

/** Admin16: fila de aprovação. */
export async function listCampaignsPendingReview(actor: SessionActor): Promise<CampaignRow[]> {
  return getCampaignService().listPendingReview(actor);
}

/** B2B08: insights do ambiente do próprio parceiro marca; `null` sem parceiro marca habilitado. */
export async function getInsights(actor: SessionActor, category: string, gradeStage: string): Promise<InsightsResult | null> {
  try {
    return await getInsightsService().query(actor, { category, gradeStage });
  } catch {
    return null;
  }
}

/** B2B09: extratos do próprio parceiro, já formatados para exibição. */
export async function listMyStatements(actor: SessionActor): Promise<DisplayStatement[]> {
  const partnerId = await myPartnerId(actor);
  if (!partnerId) return [];
  return getStatementService().listForPartner(actor, partnerId);
}
