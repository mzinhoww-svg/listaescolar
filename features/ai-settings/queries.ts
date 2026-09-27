import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

import type { AiSettingsView } from "./ports";

const rowSchema = z.object({
  id: z.uuid(),
  scope: z.string(),
  confidence_threshold: z.union([z.string(), z.number()]),
  item_confidence_threshold: z.union([z.string(), z.number()]),
  critical_alerts: z.array(z.string()),
  max_escalations: z.number(),
  pipeline_version: z.string(),
  auto_publish_enabled: z.boolean(),
  routes: z.unknown(),
  updated_at: z.string(),
});

/** Leitura admin de `ai_settings` pelo client de SESSÃO (RLS `ai_settings_select_admin`, 0202). Falha aberta: sem linha, erro (nunca inventa config). */
export async function getAiSettingsForAdmin(actor: SessionActor): Promise<AiSettingsView> {
  if (actor.role !== "admin" && actor.role !== "system") throw new Error("forbidden");
  const client = await createClient();
  const { data, error } = await client.from("ai_settings").select("*").eq("scope", "default").single();
  if (error) throw new Error(`ai_settings indisponível: ${error.message}`);
  const r = rowSchema.parse(data);
  return {
    id: r.id,
    scope: r.scope,
    confidenceThreshold: Number(r.confidence_threshold),
    itemConfidenceThreshold: Number(r.item_confidence_threshold),
    criticalAlerts: r.critical_alerts,
    maxEscalations: r.max_escalations,
    pipelineVersion: r.pipeline_version,
    autoPublishEnabled: r.auto_publish_enabled,
    routes: r.routes,
    updatedAt: new Date(r.updated_at),
  };
}
