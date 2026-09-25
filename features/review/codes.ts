// Códigos fechados da revisão humana (S10). Só códigos entram em ai_decisions; frases ficam em phrases.ts.

/** Motivos de recusa (lista fechada: texto livre poderia conter dado de menor). Espelha review_reject. */
export const REJECT_REASONS = [
  "not_a_school_list",
  "illegible_document",
  "wrong_school_grade_year",
  "duplicate_submission",
  "incomplete_list",
  "inappropriate_content",
  "other",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** Bloqueios de aprovação/publicação, na ordem canônica de exibição. */
export const INTRINSIC_BLOCKERS = [
  "no_items",
  "item_name_missing",
  "item_quantity_missing",
  "item_category_missing",
  "grade_missing",
  "school_year_missing",
  "school_missing",
] as const;
export const CONTEXT_BLOCKERS = [
  "context_unavailable",
  "school_not_found",
  "school_suspended",
  "municipality_not_enabled",
  "grade_unresolved",
  "school_year_invalid",
  "list_archived",
] as const;
export const BLOCKER_CODES = [...INTRINSIC_BLOCKERS, "critical_alerts_unconfirmed", ...CONTEXT_BLOCKERS] as const;
export type BlockerCode = (typeof BLOCKER_CODES)[number];

/** Motivo gravado em `review/approved` quando havia alerta crítico e o admin confirmou o documento. */
export const CRITICAL_ACK_REASON = "critical_alerts_acknowledged";

/** Origem do item na revisão. */
export const ITEM_ORIGINS = ["extracted", "edited", "added"] as const;
export type ItemOrigin = (typeof ITEM_ORIGINS)[number];

/** Falhas de publicação humana gravadas em `review/publish_failed`. */
export const PUBLISH_FAIL_INVALID_RESULT = "invalid_publish_result";
export const PUBLISH_FAIL_REJECTED = "publish_rejected";
export const PUBLISH_FAIL_INVALID_ITEMS = "invalid_extraction_result";
export const PUBLISH_FAIL_CONTEXT = "context_unavailable";
