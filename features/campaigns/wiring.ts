import "server-only";

import type { SessionActor } from "@/features/auth/actor";
import { createAdminClient } from "@/lib/supabase/admin";

import * as repo from "./repository";
import { CampaignService, type CampaignRepository } from "./service";
import { InsightsService, type InsightsRepo } from "./insights-service";
import { StatementService, type StatementRepo } from "./statement-service";
import { TrackingService, type TrackingRepo } from "./tracking-service";

// Composição real dos serviços de campanhas B2B (S26). Cada Server Action chama getCampaignService()/
// getInsightsService()/getStatementService() e nunca importa repository.ts direto — mesmo padrão de
// features/b2b/wiring.ts.

function realCampaignRepository(): CampaignRepository {
  const client = createAdminClient();
  return {
    createCampaign: (actor, partnerId, payload) => repo.createCampaign(client, actor, partnerId, payload),
    transitionCampaign: (actor, campaignId, to, reason) => repo.transitionCampaign(client, actor, campaignId, to, reason),
    listCampaignsForPartner: (partnerId) => repo.listCampaignsForPartner(client, partnerId),
    listCampaignsPendingReview: () => repo.listCampaignsPendingReview(client),
    getCampaign: (campaignId) => repo.getCampaign(client, campaignId),
    isPartnerMemberOrAdmin,
  };
}

// `b2b_partner_members` tem `unique(profile_id)` (0501): um perfil pertence a NO MÁXIMO um parceiro, para sempre —
// "membro de vários parceiros" é impossível por desenho do banco, não por sorte da consulta. Mesmo assim, o filtro
// de papel abaixo é EXPLÍCITO (`member_role = 'owner'`, o único papel que hoje existe) em vez de confiar apenas em
// "encontrou uma linha" — revisão de segurança independente.
async function callerBrandEnvironment(actor: SessionActor): Promise<{ isDemo: boolean } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("b2b_partner_members")
    .select("b2b_partners(partner_type, status)")
    .eq("profile_id", actor.userId)
    .eq("member_role", "owner")
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { b2b_partners: { partner_type: string; status: string } | { partner_type: string; status: string }[] | null }).b2b_partners;
  const partner = Array.isArray(raw) ? raw[0] : raw;
  if (!partner || partner.partner_type !== "brand" || !["sandbox", "active"].includes(partner.status)) return null;
  return { isDemo: partner.status === "sandbox" };
}

function realInsightsRepository(): InsightsRepo {
  const client = createAdminClient();
  return {
    insightsRaw: (category, gradeStage, isDemo) => repo.insightsRaw(client, category, gradeStage, isDemo),
    getMinK: () => repo.getMinK(client),
    callerBrandEnvironment,
  };
}

async function isPartnerMemberOrAdmin(actor: SessionActor, partnerId: string): Promise<boolean> {
  if (actor.role === "admin") return true;
  const client = createAdminClient();
  const { data } = await client
    .from("b2b_partner_members")
    .select("partner_id")
    .eq("partner_id", partnerId)
    .eq("profile_id", actor.userId)
    .eq("member_role", "owner")
    .maybeSingle();
  return data !== null;
}

function realStatementRepository(): StatementRepo {
  const client = createAdminClient();
  return {
    generateStatement: (actor, partnerId, periodStart, periodEnd, paymentInstruction) => repo.generateStatement(client, actor, partnerId, periodStart, periodEnd, paymentInstruction),
    listStatementsForPartner: (partnerId) => repo.listStatementsForPartner(client, partnerId),
    isPartnerMemberOrAdmin,
  };
}

export function getCampaignService(): CampaignService {
  return new CampaignService({ repo: realCampaignRepository() });
}

export function getInsightsService(): InsightsService {
  return new InsightsService(realInsightsRepository());
}

export function getStatementService(): StatementService {
  return new StatementService(realStatementRepository());
}

/** Server Actions de owner/admin que precisam do partnerId a partir do ator (mesmo padrão de features/b2b). */
export async function myPartnerId(actor: SessionActor): Promise<string | null> {
  const client = createAdminClient();
  const { data } = await client.from("b2b_partner_members").select("partner_id").eq("profile_id", actor.userId).eq("member_role", "owner").maybeSingle();
  return (data as { partner_id: string } | null)?.partner_id ?? null;
}

function realTrackingRepository(): TrackingRepo {
  const client = createAdminClient();
  return {
    // `listVersionId` não é mais opcional (0503: coluna not null) — quem chama SEMPRE tem uma lista publicada em mãos.
    recordCampaignEvent: (campaignId, listVersionId, eventType, dedupeKey) => repo.recordCampaignEvent(client, campaignId, listVersionId, eventType, dedupeKey),
  };
}

/** Único jeito seguro de registrar impressão/clique — nunca chamar `repository.recordCampaignEvent` direto com um
 * `dedupe_key` vindo do cliente (ver comentário de topo de tracking-service.ts). */
export function getTrackingService(): TrackingService {
  return new TrackingService(realTrackingRepository());
}

export async function serveCampaigns(listVersionId: string, limit = 3): Promise<repo.ServedCampaign[]> {
  const client = createAdminClient();
  return repo.serveCampaigns(client, listVersionId, limit);
}

/** Desempenho agregado por dia (dono/admin), já com a supressão por k mínimo aplicada no banco. */
export async function getCampaignPerformance(actor: SessionActor, campaignId: string): Promise<repo.CampaignPerformanceDay[]> {
  const client = createAdminClient();
  return repo.getCampaignPerformance(client, actor, campaignId);
}

/** Admin: configura o k mínimo dos insights (padrão 5). Checagem de papel é de quem chama (Server Action). */
export async function setInsightsMinK(actor: SessionActor, minK: number): Promise<number> {
  const client = createAdminClient();
  return repo.setMinK(client, actor, minK);
}
