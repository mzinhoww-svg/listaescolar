import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { ActivePlan, PlanDraft } from "./ports";
import { fail, requireAdmin } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

const tierRow = z.object({ id: z.uuid(), min_items: z.number().int(), max_items: z.number().int().nullable(), price_cents: z.number().int() });
const packageRow = z.object({ id: z.uuid(), amount_cents: z.number().int() });
const planRow = z.object({
  id: z.uuid(),
  version: z.number().int(),
  status: z.enum(["active", "archived"]),
  free_leads: z.number().int(),
  free_leads_validity_days: z.number().int().nullable(),
  pass_price_cents: z.number().int().nullable(),
  pass_included_leads: z.number().int().nullable(),
  pass_max_installments: z.number().int().nullable(),
  season_start_month: z.number().int(),
  season_end_month: z.number().int(),
});

async function loadPlan(admin: SupabaseClient, planId: string): Promise<ActivePlan> {
  const [planRes, tiersRes, packagesRes] = await Promise.all([
    admin.from("plans").select("*").eq("id", planId).single(),
    admin.from("plan_price_tiers").select("id, min_items, max_items, price_cents").eq("plan_id", planId).order("position"),
    admin.from("plan_credit_packages").select("id, amount_cents").eq("plan_id", planId).order("position"),
  ]);
  if (planRes.error) fail("ler plano", planRes.error);
  if (tiersRes.error) fail("ler faixas do plano", tiersRes.error);
  if (packagesRes.error) fail("ler pacotes do plano", packagesRes.error);
  const p = planRow.parse(planRes.data);
  const tiers = z.array(tierRow).parse(tiersRes.data ?? []);
  const packages = z.array(packageRow).parse(packagesRes.data ?? []);
  return {
    id: p.id,
    version: p.version,
    freeLeads: p.free_leads,
    freeLeadsValidityDays: p.free_leads_validity_days,
    seasonStartMonth: p.season_start_month,
    seasonEndMonth: p.season_end_month,
    tiers: tiers.map((t) => ({ minItems: t.min_items, maxItems: t.max_items, priceCents: t.price_cents })),
    packages: packages.map((k) => ({ id: k.id, amountCents: k.amount_cents })),
    pass:
      p.pass_price_cents === null || p.pass_included_leads === null || p.pass_max_installments === null
        ? null
        : { priceCents: p.pass_price_cents, includedLeads: p.pass_included_leads, maxInstallments: p.pass_max_installments },
  };
}

/** Plano ativo (público para `authenticated`, RLS `status = 'active'`); `null` sem plano publicado ainda. */
export async function getActivePlan(admin: SupabaseClient): Promise<ActivePlan | null> {
  const { data, error } = await admin.from("plans").select("id").eq("status", "active").maybeSingle();
  if (error) fail("ler plano ativo", error);
  if (!data) return null;
  return loadPlan(admin, z.object({ id: z.uuid() }).parse(data).id);
}

/** Histórico de versões (admin only: tiers/pacotes de planos arquivados não são legíveis por `authenticated`). */
export async function listPlanHistory(admin: SupabaseClient, actor: SessionActor): Promise<ActivePlan[]> {
  await requireAdmin(actor);
  const { data, error } = await admin.from("plans").select("id").order("version", { ascending: false });
  if (error) fail("ler histórico de planos", error);
  const ids = z.array(z.object({ id: z.uuid() })).parse(data ?? []).map((r) => r.id);
  return Promise.all(ids.map((id) => loadPlan(admin, id)));
}

/** `billing_plan_publish`: só admin (a função confere de novo, em profundidade). */
export async function publishPlan(admin: SupabaseClient, actor: SessionActor, draft: PlanDraft): Promise<string> {
  await requireAdmin(actor);
  const payload = {
    free_leads: draft.freeLeads,
    free_leads_validity_days: draft.freeLeadsValidityDays,
    season: { start_month: draft.season.startMonth, end_month: draft.season.endMonth },
    tiers: draft.tiers.map((t) => ({ min_items: t.minItems, max_items: t.maxItems, price_cents: t.priceCents })),
    packages: draft.packages.map((k) => ({ amount_cents: k.amountCents })),
    pass: draft.pass ? { price_cents: draft.pass.priceCents, included_leads: draft.pass.includedLeads, max_installments: draft.pass.maxInstallments } : null,
  };
  const { data, error } = await admin.rpc("billing_plan_publish", { p_actor_id: actor.userId, p_plan: payload });
  if (error) fail("publicar plano", error);
  return z.uuid().parse(data);
}
