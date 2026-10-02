import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { fail, numericAsNumber, requireActor } from "./repository-shared";

/**
 * D-158 (S19): este arquivo tinha 320 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do
 * D-057 (S18): `repository-shared.ts` (guarda/erro/conversão numérica comuns), `repository-insights.ts`
 * (insights com k-anonimato), `repository-statements.ts` (extrato B2B). Este arquivo continua sendo o ÚNICO
 * ponto de import (`@/features/campaigns/repository`) — reexporta os dois irmãos e mantém CRUD de campanha,
 * eventos, desempenho e servir campanha (o núcleo do domínio).
 *
 * Repositório server-only das campanhas B2B (S26). Recebe o cliente de SERVIÇO e um SessionActor; posse e papel
 * são conferidos aqui E de novo, dentro da mesma chamada, pelas funções SQL (0503) — defesa em profundidade.
 * Mesmo padrão de features/b2b/repository.ts.
 */
export { getMinK, insightsRaw, setMinK, type RawInsightCell } from "./repository-insights";
export { generateStatement, listStatementsForPartner, type Statement, type StatementLineItem } from "./repository-statements";

export type CampaignRow = {
  id: string;
  partnerId: string;
  name: string;
  productLabel: string;
  creativeText: string | null;
  pricingModel: "cpm" | "cpc";
  bidCents: number;
  dailyBudgetCents: number | null;
  totalBudgetCents: number;
  accruedTotalCents: number;
  targetCategory: string;
  targetGradeStages: readonly string[] | null;
  targetCities: readonly string[] | null;
  status: "draft" | "pending_review" | "approved" | "rejected" | "paused" | "completed";
  statusReason: string | null;
  /** Só preenchido quando `status = 'paused'`: quem pediu a pausa. `admin` = só admin retoma; `owner`/`budget_auto` = dono também retoma. */
  pauseOrigin: "owner" | "admin" | "budget_auto" | null;
  decidedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

const campaignRowSchema = z
  .object({
    id: z.uuid(),
    partner_id: z.uuid(),
    name: z.string(),
    product_label: z.string(),
    creative_text: z.string().nullable(),
    pricing_model: z.enum(["cpm", "cpc"]),
    bid_cents: z.number(),
    daily_budget_cents: z.number().nullable(),
    total_budget_cents: z.number(),
    accrued_total_cents: numericAsNumber,
    target_category: z.string(),
    target_grade_stages: z.array(z.string()).nullable(),
    target_cities: z.array(z.string()).nullable(),
    status: z.enum(["draft", "pending_review", "approved", "rejected", "paused", "completed"]),
    status_reason: z.string().nullable(),
    pause_origin: z.enum(["owner", "admin", "budget_auto"]).nullable(),
    decided_at: z.string().nullable(),
    is_demo: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform(
    (r): CampaignRow => ({
      id: r.id,
      partnerId: r.partner_id,
      name: r.name,
      productLabel: r.product_label,
      creativeText: r.creative_text,
      pricingModel: r.pricing_model,
      bidCents: r.bid_cents,
      dailyBudgetCents: r.daily_budget_cents,
      totalBudgetCents: r.total_budget_cents,
      accruedTotalCents: r.accrued_total_cents,
      targetCategory: r.target_category,
      targetGradeStages: r.target_grade_stages,
      targetCities: r.target_cities,
      status: r.status,
      statusReason: r.status_reason,
      pauseOrigin: r.pause_origin,
      decidedAt: r.decided_at,
      isDemo: r.is_demo,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  );

export type CreateCampaignPayload = {
  name: string;
  productLabel: string;
  creativeText?: string;
  pricingModel: "cpm" | "cpc";
  bidCents: number;
  dailyBudgetCents?: number;
  totalBudgetCents: number;
  targetCategory: string;
  targetGradeStages?: readonly string[];
  targetCityIbgeCodes?: readonly string[];
};

export async function createCampaign(client: SupabaseClient, actor: SessionActor, partnerId: string, payload: CreateCampaignPayload): Promise<{ campaignId: string }> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_campaign_create", {
    p_actor_id: actor.userId,
    p_partner_id: partnerId,
    p_payload: {
      name: payload.name,
      product_label: payload.productLabel,
      creative_text: payload.creativeText ?? null,
      pricing_model: payload.pricingModel,
      bid_cents: payload.bidCents,
      daily_budget_cents: payload.dailyBudgetCents ?? null,
      total_budget_cents: payload.totalBudgetCents,
      target_category: payload.targetCategory,
      target_grade_stages: payload.targetGradeStages ?? null,
      target_cities: payload.targetCityIbgeCodes ?? null,
    },
  });
  if (error) fail("criar campanha", error);
  return { campaignId: z.uuid().parse(data) };
}

export async function transitionCampaign(client: SupabaseClient, actor: SessionActor, campaignId: string, to: string, reason?: string): Promise<string> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_campaign_transition", { p_actor_id: actor.userId, p_campaign_id: campaignId, p_to: to, p_reason: reason ?? null });
  if (error) fail("mudar status da campanha", error);
  return z.string().parse(data);
}

export async function listCampaignsForPartner(client: SupabaseClient, partnerId: string): Promise<CampaignRow[]> {
  const { data, error } = await client.from("b2b_campaigns").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false });
  if (error) fail("listar campanhas", error);
  return z.array(campaignRowSchema).parse(data ?? []);
}

export async function listCampaignsPendingReview(client: SupabaseClient): Promise<CampaignRow[]> {
  const { data, error } = await client.from("b2b_campaigns").select("*").eq("status", "pending_review").order("created_at", { ascending: true });
  if (error) fail("listar campanhas pendentes", error);
  return z.array(campaignRowSchema).parse(data ?? []);
}

export async function getCampaign(client: SupabaseClient, campaignId: string): Promise<CampaignRow | null> {
  const { data, error } = await client.from("b2b_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (error) fail("buscar campanha", error);
  return data ? campaignRowSchema.parse(data) : null;
}

export async function recordCampaignEvent(client: SupabaseClient, campaignId: string, listVersionId: string, eventType: "impression" | "click", dedupeKey: string): Promise<boolean> {
  const { data, error } = await client.rpc("b2b_campaign_record_event", { p_campaign_id: campaignId, p_list_version_id: listVersionId, p_event_type: eventType, p_dedupe_key: dedupeKey });
  if (error) fail("registrar evento de campanha", error);
  return z.boolean().parse(data);
}

export type CampaignPerformanceDay = { day: string; impressions: number | null; clicks: number | null; accruedCents: number | null; suppressed: boolean };

const performanceSchema = z.object({
  day: z.string(),
  impressions: z.number().nullable(),
  clicks: z.number().nullable(),
  accrued_cents: numericAsNumber.nullable(),
  suppressed: z.boolean(),
});

/** Único jeito de o dono/admin ver desempenho: agregado por DIA, com a mesma supressão por k mínimo (escolas
 * distintas) dos insights — nunca ler `b2b_campaign_events`/`b2b_campaign_ledger` linha a linha (contornaria o
 * k-anonimato: revelaria o carimbo de hora de cada evento, correlacionável com a segmentação da campanha). */
export async function getCampaignPerformance(client: SupabaseClient, actor: SessionActor, campaignId: string): Promise<CampaignPerformanceDay[]> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_campaign_performance", { p_actor_id: actor.userId, p_campaign_id: campaignId });
  if (error) fail("consultar desempenho da campanha", error);
  return z
    .array(performanceSchema)
    .parse(data ?? [])
    .map((r) => ({ day: r.day, impressions: r.impressions, clicks: r.clicks, accruedCents: r.accrued_cents, suppressed: r.suppressed }));
}

// GUARDA para toda exibição futura (widget, página pública da lista, o que for): `sponsored` é `z.literal(true)`
// de propósito — nem o tipo (`ServedCampaign.sponsored: true`, não `boolean`) nem o parse aceitam outro valor. Se
// algum dia o banco parar de mandar `true` (bug de função, campo renomeado etc.), o `.parse()` FALHA alto em vez
// de deixar uma campanha aparecer sem o selo "Patrocinado" — nunca decidir se mostra o selo na camada de UI.
export type ServedCampaign = { campaignId: string; partnerId: string; name: string; productLabel: string; creativeText: string | null; pricingModel: "cpm" | "cpc"; sponsored: true };

const servedSchema = z.object({
  campaign_id: z.uuid(),
  partner_id: z.uuid(),
  name: z.string(),
  product_label: z.string(),
  creative_text: z.string().nullable(),
  pricing_model: z.enum(["cpm", "cpc"]),
  sponsored: z.literal(true),
});

export async function serveCampaigns(client: SupabaseClient, listVersionId: string, limit = 3): Promise<ServedCampaign[]> {
  const { data, error } = await client.rpc("b2b_campaign_serve", { p_list_version_id: listVersionId, p_limit: limit });
  if (error) fail("servir campanha", error);
  return z
    .array(servedSchema)
    .parse(data ?? [])
    .map((r) => ({ campaignId: r.campaign_id, partnerId: r.partner_id, name: r.name, productLabel: r.product_label, creativeText: r.creative_text, pricingModel: r.pricing_model, sponsored: true as const }));
}
