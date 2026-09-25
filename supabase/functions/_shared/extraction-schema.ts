// Contrato de saída do pipeline de extração. Compartilhado: features/submissions (re-exporta) e a Edge Function.
// Importa "zod" por nome: no Deno vem do deno.json da função (ocr-worker/deno.json); no Node, do node_modules.
import { z } from "zod";

/** Os 7 códigos de alerta do SPEC (§6). Nenhum outro código existe. */
export const ALERT_CODE_LIST = [
  "low_confidence_item",
  "ambiguous_item",
  "handwritten",
  "possible_collective_item",
  "restrictive_brand_or_spec",
  "text_document_mismatch",
  "invalid_school_grade_year",
] as const;
export type AlertCode = (typeof ALERT_CODE_LIST)[number];
const alertCode = z.enum(ALERT_CODE_LIST);

export const ITEM_CATEGORIES = [
  "papelaria",
  "escrita",
  "arte",
  "tecnologia",
  "higiene",
  "livros",
  "uniforme",
  "outros",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

// Extensão retrocompatível (S08): os campos novos são opcionais, então o resultado do pipeline de demonstração
// da S07 continua válido. O resultado real preenche todos.
export const extractionResultSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1).max(300),
      quantity: z.number().nonnegative().nullable(),
      unit: z.string().max(40).nullable(),
      confidence: z.number().min(0).max(1),
      normalizedName: z.string().max(300).optional(),
      category: z.enum(ITEM_CATEGORIES).optional(),
      alerts: z.array(alertCode).max(10).optional(),
    }),
  ),
  overallConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(300)),
  pipelineVersion: z.string().max(40).optional(),
  /** Alertas do documento (união dos alertas dos itens e dos do documento inteiro). */
  alerts: z.array(alertCode).max(7).optional(),
  /** Subconjunto de `alerts` que `ai_settings.critical_alerts` marca como críticos. */
  criticalAlerts: z.array(alertCode).max(7).optional(),
  /** Aceito com confiança abaixo do limiar (última rota): revisão humana obrigatória. */
  lowConfidence: z.boolean().optional(),
  /** Sempre `true` no pipeline real: nada sai daqui como publicável automático. */
  requiresReview: z.literal(true).optional(),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
