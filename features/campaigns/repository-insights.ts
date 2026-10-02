import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { fail, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

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
