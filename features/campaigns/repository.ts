import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { campaignDbErrorCode, CampaignServiceError, type CampaignServiceErrorCode } from "./errors";

// Repositório server-only das campanhas B2B (S26). Recebe o cliente de SERVIÇO e um SessionActor; posse e papel
// são conferidos aqui E de novo, dentro da mesma chamada, pelas funções SQL (0503) — defesa em profundidade.
// Mesmo padrão de features/b2b/repository.ts.

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new CampaignServiceError("ator não vem da sessão", "forbidden");
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: CampaignServiceErrorCode): never {
  throw new CampaignServiceError(`${what}: ${error.message}`, code ?? campaignDbErrorCode(error), error.code);
}

/** Colunas `numeric` (0503: `accrued_total_cents`, livro-razão/extrato em milésimos de centavo para o CPM exato)
 * chegam do PostgREST como string, nunca como float, para não perder precisão — converte para number aqui, na
 * borda, depois de já ter passado pelo Postgres com precisão total. */
const numericAsNumber = z.union([z.number(), z.string()]).transform((v) => Number(v));

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

export type RawInsightCell = { cityIbge: string; cityName: string; distinctSchools: number };

const rawInsightSchema = z.object({ city_ibge: z.string(), city_name: z.string(), distinct_schools: z.number() });

/** Contagem CRUA por ESCOLA distinta (sem k-anonimato) — service_role only. Chamado só por insights-service, que
 * aplica a supressão. */
export async function insightsRaw(client: SupabaseClient, category: string, gradeStage: string, isDemo: boolean): Promise<RawInsightCell[]> {
  const { data, error } = await client.rpc("b2b_insights_raw", { p_category: category, p_grade_stage: gradeStage, p_is_demo: isDemo });
  if (error) fail("consultar insights", error);
  return z
    .array(rawInsightSchema)
    .parse(data ?? [])
    .map((r) => ({ cityIbge: r.city_ibge, cityName: r.city_name, distinctSchools: r.distinct_schools }));
}

export async function getMinK(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.from("b2b_insights_settings").select("min_k").limit(1).maybeSingle();
  if (error) fail("consultar min_k", error);
  return z.object({ min_k: z.number() }).parse(data).min_k;
}

export async function setMinK(client: SupabaseClient, actor: SessionActor, minK: number): Promise<number> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_insights_settings_set", { p_actor_id: actor.userId, p_min_k: minK });
  if (error) fail("configurar min_k", error);
  return z.number().parse(data);
}

export type StatementLineItem = {
  id: string;
  source: "api_usage" | "campaign_cpm" | "campaign_cpc";
  campaignId: string | null;
  label: string;
  quantity: number;
  unit: string;
  unitPriceCents: number | null;
  amountCents: number | null;
  pricingStatus: "priced" | "unavailable";
};

export type Statement = {
  id: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  paymentInstruction: string | null;
  createdAt: string;
  lineItems: readonly StatementLineItem[];
};

const lineItemSchema = z.object({
  id: z.uuid(),
  source: z.enum(["api_usage", "campaign_cpm", "campaign_cpc"]),
  campaign_id: z.uuid().nullable(),
  label: z.string(),
  quantity: numericAsNumber,
  unit: z.string(),
  unit_price_cents: z.number().nullable(),
  amount_cents: numericAsNumber.nullable(),
  pricing_status: z.enum(["priced", "unavailable"]),
});

export async function generateStatement(
  client: SupabaseClient,
  actor: SessionActor,
  partnerId: string,
  periodStart: string,
  periodEnd: string,
  paymentInstruction?: string,
): Promise<{ statementId: string }> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_statement_generate", {
    p_actor_id: actor.userId,
    p_partner_id: partnerId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_payment_instruction: paymentInstruction ?? null,
  });
  if (error) fail("gerar extrato", error);
  return { statementId: z.uuid().parse(data) };
}

export async function listStatementsForPartner(client: SupabaseClient, partnerId: string): Promise<Statement[]> {
  const { data, error } = await client.from("b2b_statements").select("*, b2b_statement_line_items(*)").eq("partner_id", partnerId).order("period_start", { ascending: false });
  if (error) fail("listar extratos", error);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const items = z.array(lineItemSchema).parse(row.b2b_statement_line_items ?? []);
    return {
      id: z.uuid().parse(row.id),
      partnerId: z.uuid().parse(row.partner_id),
      periodStart: z.string().parse(row.period_start),
      periodEnd: z.string().parse(row.period_end),
      paymentInstruction: z.string().nullable().parse(row.payment_instruction),
      createdAt: z.string().parse(row.created_at),
      lineItems: items.map((i) => ({
        id: i.id,
        source: i.source,
        campaignId: i.campaign_id,
        label: i.label,
        quantity: i.quantity,
        unit: i.unit,
        unitPriceCents: i.unit_price_cents,
        amountCents: i.amount_cents,
        pricingStatus: i.pricing_status,
      })),
    };
  });
}

export async function recordCampaignEvent(client: SupabaseClient, campaignId: string, listVersionId: string, eventType: "impression" | "click", dedupeKey: string): Promise<boolean> {
  const { data, error } = await client.rpc("b2b_campaign_record_event", { p_campaign_id: campaignId, p_list_version_id: listVersionId, p_event_type: eventType, p_dedupe_key: dedupeKey });
  if (error) fail("registrar evento de campanha", error);
  return z.boolean().parse(data);
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
