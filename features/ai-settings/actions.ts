"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

import { updateAiSettingsSchema } from "./schemas";

const NEXT = "/admin/ia";

/**
 * Edição admin de `ai_settings` (S16). Escreve pelo client de SESSÃO: a RLS `ai_settings_update_admin` (0202) já
 * confere `auth_role() in ('admin','system')` no banco; aqui confere de novo pela sessão (`getSessionActor`),
 * como pede a regra de autonomia do repositório. `auto_publish_enabled`/`routes` não estão no schema (nunca chegam ao update) e o gatilho
 * `ai_settings_audit` (0202) grava a mudança no audit_log sozinho.
 */
export async function updateAiSettingsAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor || actor.role !== "admin") redirect(`${NEXT}?erro=forbidden`);
  const parsed = updateAiSettingsSchema.safeParse({
    confidenceThreshold: formData.get("confidenceThreshold"),
    itemConfidenceThreshold: formData.get("itemConfidenceThreshold"),
    criticalAlerts: formData.getAll("criticalAlerts").filter((v): v is string => typeof v === "string"),
    maxEscalations: formData.get("maxEscalations"),
    pipelineVersion: formData.get("pipelineVersion"),
    usdBrlRate: formData.get("usdBrlRate"),
  });
  if (!parsed.success) redirect(`${NEXT}?erro=invalido`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_settings")
    .update({
      confidence_threshold: parsed.data.confidenceThreshold,
      item_confidence_threshold: parsed.data.itemConfidenceThreshold,
      critical_alerts: parsed.data.criticalAlerts,
      max_escalations: parsed.data.maxEscalations,
      pipeline_version: parsed.data.pipelineVersion,
      usd_brl_rate: parsed.data.usdBrlRate,
    })
    .eq("scope", "default");
  if (error) {
    console.error("atualizar ai_settings", error.message);
    redirect(`${NEXT}?erro=falha`);
  }
  revalidatePath(NEXT);
  redirect(`${NEXT}?ok=1`);
}
