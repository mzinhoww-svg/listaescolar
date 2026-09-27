export const CRITICAL_ALERT_CODES = [
  "low_confidence_item",
  "ambiguous_item",
  "handwritten",
  "possible_collective_item",
  "restrictive_brand_or_spec",
  "text_document_mismatch",
  "invalid_school_grade_year",
] as const;
export type CriticalAlertCode = (typeof CRITICAL_ALERT_CODES)[number];
export const CRITICAL_ALERT_LABEL: Record<CriticalAlertCode, string> = {
  low_confidence_item: "Item com baixa confiança",
  ambiguous_item: "Item ambíguo",
  handwritten: "Manuscrito",
  possible_collective_item: "Possível item coletivo",
  restrictive_brand_or_spec: "Marca ou especificação restritiva",
  text_document_mismatch: "Texto não corresponde ao documento",
  invalid_school_grade_year: "Escola, série ou ano inválido",
};

/** Visão do admin (S16). `routes` e `autoPublishEnabled` só leitura nesta fatia — ver Ruling no ledger. */
export type AiSettingsView = {
  id: string;
  scope: string;
  confidenceThreshold: number;
  itemConfidenceThreshold: number;
  criticalAlerts: string[];
  maxEscalations: number;
  pipelineVersion: string;
  autoPublishEnabled: boolean;
  routes: unknown;
  updatedAt: Date;
};
