// Faixas de confiança: os limiares vêm SEMPRE de ai_settings (nada fixo no código; Ruling S10).
import type { ItemOrigin } from "./codes";

export type ConfidenceThresholds = { confidenceThreshold: number; itemConfidenceThreshold: number };
export type ConfidenceBand = "alta" | "media" | "baixa" | "conferido" | "indisponivel";

/**
 * Baixa: abaixo do limiar de item. Alta: no limiar geral ou acima. Média: entre os dois.
 * Item editado/adicionado pela equipe = "conferido" (sem número); sem settings ou sem confiança = "indisponivel".
 */
export function confidenceBand(item: { confidence: number | null; origin: ItemOrigin }, settings: ConfidenceThresholds | null): ConfidenceBand {
  if (item.origin !== "extracted") return "conferido";
  if (item.confidence === null || !settings) return "indisponivel";
  if (item.confidence < settings.itemConfidenceThreshold) return "baixa";
  if (item.confidence >= settings.confidenceThreshold) return "alta";
  return "media";
}
