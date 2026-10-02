import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { costPanelStats, type CostPanelStats } from "@/features/ai-settings/cost";
import { createClient } from "@/lib/supabase/server";

const MAX_LISTS = 500;

const rowSchema = z.object({
  provider_cost_usd_micros: z.coerce.number().int().min(0),
  unknown_cost_rows: z.coerce.number().int().min(0),
});
const rateSchema = z.object({ usd_brl_rate: z.union([z.string(), z.number(), z.null()]) });

/**
 * Custo de IA por lista (S28, M02) a partir de `ai_cost_per_entity` e da taxa de `ai_settings`, pelo client de SESSÃO
 * (RLS admin de `ai_decisions`; a view é `security_invoker`). Falha lança: a página mostra "indisponível".
 */
export async function getAiCostPanel(actor: SessionActor): Promise<CostPanelStats> {
  if (actor.role !== "admin" && actor.role !== "system") throw new Error("forbidden");
  const client = await createClient();
  const [rows, settings] = await Promise.all([
    client
      .from("ai_cost_per_entity")
      .select("provider_cost_usd_micros, unknown_cost_rows")
      .eq("entity_type", "list_submission")
      .order("first_at", { ascending: false })
      .limit(MAX_LISTS),
    client.from("ai_settings").select("usd_brl_rate").eq("scope", "default").single(),
  ]);
  if (rows.error) throw new Error(`ai_cost_per_entity indisponível: ${rows.error.message}`);
  if (settings.error) throw new Error(`ai_settings indisponível: ${settings.error.message}`);
  const rate = rateSchema.parse(settings.data).usd_brl_rate;
  const parsed = z.array(rowSchema).parse(rows.data);
  return costPanelStats(
    parsed.map((r) => ({ providerCostUsdMicros: r.provider_cost_usd_micros, unknownCostRows: r.unknown_cost_rows })),
    rate === null ? null : Number(rate),
  );
}
