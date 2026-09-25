// Códigos de motivo da decisão de publicação: lista FECHADA, na ordem canônica (ordem das regras do SPEC §6).
// Só códigos entram em ai_decisions (nunca texto do documento): ^[a-z][a-z0-9_]{0,63}$.
import { z } from "zod";

export const REASON_CODES = [
  // 1. overallScore
  "overall_below_threshold",
  "low_confidence_extraction",
  // 2. noCriticalAlert
  "critical_alert",
  // 3. noPendingItem
  "empty_list",
  "item_below_threshold",
  "item_without_quantity",
  "item_flagged",
  // 4. requiredFields
  "missing_school",
  "missing_grade",
  "missing_school_year",
  "item_incomplete",
  "extraction_metadata_missing",
  "invalid_extraction_result",
  // 5. validSchoolGradeYear
  "school_not_found",
  "school_not_verified",
  "school_suspended",
  "municipality_not_enabled",
  "grade_unresolved",
  "school_year_invalid",
  "school_grade_year_mismatch",
  "list_archived",
  // 6. officialSource
  "parent_submission",
  "submitter_not_linked",
  // 7. operational
  "demo_submission",
  "auto_publish_disabled",
  "publisher_unavailable",
  "context_unavailable",
  "settings_unavailable",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
export const reasonCodeSchema = z.enum(REASON_CODES);
export const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/** Ordena e remove duplicatas pela ordem canônica. */
export function canonicalOrder(codes: readonly ReasonCode[]): ReasonCode[] {
  return REASON_CODES.filter((c) => codes.includes(c));
}

/** Alertas que o modelo põe em UM item: item sinalizado é item pendente (Ruling S09). */
export const ITEM_ALERT_CODES: readonly string[] = ["low_confidence_item", "ambiguous_item", "possible_collective_item", "restrictive_brand_or_spec"];
/** Alerta que é a própria regra 5 do SPEC (escola, série e ano válidos): sempre bloqueia. */
export const SCHOOL_GRADE_YEAR_ALERT = "invalid_school_grade_year";
/** Justificativa quando todas as regras passam. */
export const RULES_PASSED = "rules_passed";
/** Versão das regras (gravada em `pipeline_version` das linhas `publication`); não é limiar. */
export const PUBLICATION_RULES_VERSION = "s09.1";
