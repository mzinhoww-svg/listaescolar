import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { WalletSummary } from "./ports";
import { fail, requireMemberOrAdmin } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

const summaryJson = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    balance_cents: z.number().int(),
    free_granted: z.number().int(),
    free_left: z.number().int(),
    free_expires_at: z.string().nullable(),
    plan: z.object({ id: z.uuid(), version: z.number().int() }),
    active_pass: z
      .object({ id: z.uuid(), included_leads: z.number().int(), leads_left: z.number().int(), season_start: z.string(), season_end: z.string() })
      .nullable(),
    can_receive_min_tier: z.boolean(),
    min_tier_price_cents: z.number().int().nullable(),
  }),
]);

function mapSummary(s: z.infer<typeof summaryJson>): WalletSummary {
  if (!s.available) return { available: false };
  return {
    available: true,
    balanceCents: s.balance_cents,
    freeGranted: s.free_granted,
    freeLeft: s.free_left,
    freeExpiresAt: s.free_expires_at === null ? null : new Date(s.free_expires_at),
    planVersion: s.plan.version,
    activePass: s.active_pass
      ? { id: s.active_pass.id, includedLeads: s.active_pass.included_leads, leadsLeft: s.active_pass.leads_left, seasonStart: s.active_pass.season_start, seasonEnd: s.active_pass.season_end }
      : null,
    canReceiveMinTier: s.can_receive_min_tier,
    minTierPriceCents: s.min_tier_price_cents,
  };
}

/** Carteira da PRÓPRIA papelaria (Pap06): cria a carteira se faltar (é a ação explícita da dona olhar o próprio saldo). */
export async function getSummary(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<WalletSummary> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.rpc("billing_wallet_summary", { p_stationery_id: stationeryId });
  if (error) fail("ler resumo da carteira", error);
  return mapSummary(summaryJson.parse(data));
}

/**
 * Revisão de segurança (S21): leitura PASSIVA de terceiro (admin navegando papelarias) — NUNCA cria a carteira.
 * Sem carteira, projeta os valores do plano ativo (mesmo formato de `getSummary`, sem gravar nada).
 */
export async function getSummaryReadOnly(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<WalletSummary> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.rpc("billing_wallet_summary_readonly", { p_stationery_id: stationeryId });
  if (error) fail("ler resumo da carteira (leitura)", error);
  return mapSummary(summaryJson.parse(data));
}

/** `is_demo` da papelaria (dado já público via `stationery_public`): usado para escolher o `PaymentProvider`. */
export async function getStationeryBillingInfo(admin: SupabaseClient, stationeryId: string): Promise<{ isDemo: boolean; cnpj: string; tradeName: string } | null> {
  const { data, error } = await admin.from("stationeries").select("is_demo, cnpj, trade_name").eq("id", stationeryId).maybeSingle();
  if (error) fail("ler papelaria", error);
  if (!data) return null;
  const r = z.object({ is_demo: z.boolean(), cnpj: z.string(), trade_name: z.string() }).parse(data);
  return { isDemo: r.is_demo, cnpj: r.cnpj, tradeName: r.trade_name };
}
