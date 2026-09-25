// Motor de regras da publicação automática (SPEC §6 "Decisão automática"), TypeScript puro.
// Cada regra é uma função pura (input, settings) => códigos de motivo; o veredito é a composição.
// Limiares e alertas críticos vêm SEMPRE de `settings` (ai_settings atual); nada é fixo aqui.
import { type ExtractionResult, extractionResultSchema } from "../extraction-schema.ts";
import { ITEM_ALERT_CODES, RULES_PASSED, SCHOOL_GRADE_YEAR_ALERT, type ReasonCode, canonicalOrder } from "./codes.ts";
import type { PublicationInput, PublicationSettings, Rule, Verdict } from "./types.ts";

function parseResult(input: PublicationInput): ExtractionResult | null {
  const parsed = extractionResultSchema.safeParse(input.result);
  return parsed.success ? parsed.data : null;
}

/** Alertas do documento ∪ alertas de todos os itens ∪ o que a extração já marcou como crítico. */
function allAlerts(r: ExtractionResult): string[] {
  return [...(r.alerts ?? []), ...(r.criticalAlerts ?? []), ...r.items.flatMap((i) => i.alerts ?? [])];
}

const blank = (s: string | null): boolean => s === null || s.trim() === "";

/** (1) score geral >= limiar; `lowConfidence` nunca publica sozinho. */
const overallScore: Rule = (input, settings) => {
  const r = parseResult(input);
  if (!r || !settings) return [];
  const out: ReasonCode[] = [];
  if (!(r.overallConfidence >= settings.confidenceThreshold)) out.push("overall_below_threshold");
  if (r.lowConfidence === true) out.push("low_confidence_extraction");
  return out;
};

/** (2) nenhum alerta crítico, pelos críticos ATUAIS; o que a extração marcou crítico continua valendo. */
const noCriticalAlert: Rule = (input, settings) => {
  const r = parseResult(input);
  if (!r) return [];
  const critical = settings?.criticalAlerts ?? [];
  const hit = allAlerts(r).some((a) => critical.includes(a)) || (r.criticalAlerts ?? []).length > 0;
  return hit ? ["critical_alert"] : [];
};

/** (3) nenhum item pendente: tolerância zero (confiança, quantidade e alerta de item). */
const noPendingItem: Rule = (input, settings) => {
  const r = parseResult(input);
  if (!r) return [];
  const out: ReasonCode[] = [];
  if (r.items.length === 0) out.push("empty_list");
  if (settings && r.items.some((i) => !(i.confidence >= settings.itemConfidenceThreshold))) out.push("item_below_threshold");
  if (r.items.some((i) => i.quantity === null || i.quantity <= 0)) out.push("item_without_quantity");
  if (r.items.some((i) => (i.alerts ?? []).some((a) => ITEM_ALERT_CODES.includes(a)))) out.push("item_flagged");
  return out;
};

/** (4) campos obrigatórios: escola, série, ano, dados do item e metadados da extração real (S08). */
const requiredFields: Rule = (input) => {
  const out: ReasonCode[] = [];
  const r = parseResult(input);
  if (input.schoolId === null) out.push("missing_school");
  if (blank(input.grade)) out.push("missing_grade");
  if (input.schoolYear === null) out.push("missing_school_year");
  if (!r) {
    out.push("invalid_extraction_result");
    return canonicalOrder(out);
  }
  if (r.items.some((i) => !i.normalizedName || !i.category)) out.push("item_incomplete");
  if (r.pipelineVersion === undefined || r.alerts === undefined || r.criticalAlerts === undefined || r.lowConfidence === undefined) {
    out.push("extraction_metadata_missing");
  }
  return canonicalOrder(out);
};

/** (5) escola, série e ano válidos. Campo ausente é assunto de `requiredFields`. */
const validSchoolGradeYear: Rule = (input) => {
  const ctx = input.context;
  if (!ctx) return [];
  const out: ReasonCode[] = [];
  if (input.schoolId !== null) {
    if (!ctx.school) out.push("school_not_found");
    else {
      if (ctx.school.verification === "suspended") out.push("school_suspended");
      else if (ctx.school.verification !== "verified") out.push("school_not_verified");
      if (!ctx.school.municipalityEnabled) out.push("municipality_not_enabled");
    }
  }
  if (!blank(input.grade) && !ctx.gradeSlug) out.push("grade_unresolved");
  if (input.schoolYear !== null && !ctx.validSchoolYears.includes(input.schoolYear)) out.push("school_year_invalid");
  const r = parseResult(input);
  if (r && allAlerts(r).includes(SCHOOL_GRADE_YEAR_ALERT)) out.push("school_grade_year_mismatch");
  if (ctx.currentList?.status === "archived") out.push("list_archived");
  return canonicalOrder(out);
};

/** Fonte oficial: lista de pai nunca vira oficial sozinha; escola exige remetente vinculado. */
const officialSource: Rule = (input) => {
  const out: ReasonCode[] = [];
  if (input.source === "parent") out.push("parent_submission");
  if (input.context && input.context.submitterLinked !== true) out.push("submitter_not_linked");
  return out;
};

/** Falha fechada: demo, interruptor desligado, porta/contexto/configuração ausentes. */
const operational: Rule = (input, settings) => {
  const out: ReasonCode[] = [];
  if (input.isDemo) out.push("demo_submission");
  if (settings && settings.autoPublishEnabled === false) out.push("auto_publish_disabled");
  if (!input.publisherAvailable) out.push("publisher_unavailable");
  if (!input.context) out.push("context_unavailable");
  if (!settings) out.push("settings_unavailable");
  return out;
};

export const RULES = { overallScore, noCriticalAlert, noPendingItem, requiredFields, validSchoolGradeYear, officialSource, operational } as const;

/** `auto_publish` se e somente se nenhuma regra falhar. Todas rodam sempre (sem curto-circuito). */
export function evaluatePublication(input: PublicationInput, settings: PublicationSettings | null): Verdict {
  const reasons = canonicalOrder(Object.values(RULES).flatMap((rule) => rule(input, settings)));
  const first = reasons[0];
  return first === undefined
    ? { outcome: "auto_publish", reasons: [], justification: RULES_PASSED }
    : { outcome: "human_review", reasons, justification: first };
}
