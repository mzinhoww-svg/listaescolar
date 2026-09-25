import { randomUUID } from "node:crypto";
import type { RpcClient } from "@/supabase/functions/_shared/ai/settings.ts";

export const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";
export const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const settingsRow = (over: Record<string, unknown> = {}) => ({
  confidence_threshold: 0.8,
  item_confidence_threshold: 0.6,
  critical_alerts: ["handwritten", "invalid_school_grade_year", "text_document_mismatch"],
  routes: {
    cheap: { provider: "fake", timeout_ms: 20000 },
    strong: { provider: "fake", timeout_ms: 40000 },
    vision: { provider: "fake", timeout_ms: 40000 },
  },
  max_escalations: 1,
  pipeline_version: "s08.1",
  ...over,
});

export const PROMPT_ROW = {
  key: "extract_list",
  version: 1,
  text: "instrucoes do sistema",
  schema: {},
};

/** RpcClient em memória com as três funções de IA. `decisions` guarda o que foi gravado. */
export function memoryRpc(over: { settings?: unknown; prompt?: unknown } = {}) {
  const decisions: Record<string, unknown>[] = [];
  const rpc: RpcClient = {
    async rpc(fn, args) {
      if (fn === "ai_get_settings") return { data: over.settings ?? settingsRow(), error: null };
      if (fn === "ai_get_active_prompt") return { data: over.prompt ?? PROMPT_ROW, error: null };
      if (fn === "ai_record_decision") {
        decisions.push((args as { p_decision: Record<string, unknown> }).p_decision);
        return { data: randomUUID(), error: null };
      }
      return { data: null, error: { message: "unknown" } };
    },
  };
  return { rpc, decisions };
}

export const item = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  quantity: 2,
  unit: "un",
  category: "papelaria",
  confidence: 0.9,
  ...extra,
});
export const good = (
  items = [item("Caderno brochura 96 folhas")],
  extra: Record<string, unknown> = {},
) => ({
  json: { items, overallConfidence: 0.92, ...extra },
});
