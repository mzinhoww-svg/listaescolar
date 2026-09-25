// Portão puro da aprovação e da publicação humanas (S10). Sem I/O: recebe a versão vigente e o contexto da porta.
import type { PublicationContext } from "../../supabase/functions/_shared/publication/types";

import { BLOCKER_CODES, type BlockerCode } from "./codes";
import type { ReviewItem } from "./schemas";

export type GateInput = {
  schoolId: string | null;
  grade: string | null;
  schoolYear: number | null;
  items: readonly ReviewItem[];
};

/** Alerta crítico do documento: exige a confirmação explícita "Conferi o documento original". */
export type CriticalAck = { required: boolean; acknowledged: boolean };

function intrinsic(v: GateInput): Set<BlockerCode> {
  const out = new Set<BlockerCode>();
  if (v.items.length === 0) out.add("no_items");
  for (const it of v.items) {
    if (it.name.trim() === "") out.add("item_name_missing");
    if (it.quantity === null) out.add("item_quantity_missing");
    if (it.category === null) out.add("item_category_missing");
  }
  if (v.grade === null || v.grade.trim() === "") out.add("grade_missing");
  if (v.schoolYear === null) out.add("school_year_missing");
  if (v.schoolId === null) out.add("school_missing");
  return out;
}

const ordered = (s: Set<BlockerCode>): BlockerCode[] => BLOCKER_CODES.filter((c) => s.has(c));

/** Bloqueios de aprovação (o SQL confere os intrínsecos de novo). */
export function approvalBlockers(v: GateInput, ack?: CriticalAck): BlockerCode[] {
  const out = intrinsic(v);
  if (ack?.required && !ack.acknowledged) out.add("critical_alerts_unconfirmed");
  return ordered(out);
}

/**
 * Bloqueios de publicação: intrínsecos + contexto da porta. NÃO exige escola `verified`: a revisão humana com o documento
 * substitui a verificação da LISTA, não a da escola (Ruling S10).
 */
export function publicationBlockers(v: GateInput, ctx: PublicationContext | null, ack?: CriticalAck): BlockerCode[] {
  const out = intrinsic(v);
  if (ack?.required && !ack.acknowledged) out.add("critical_alerts_unconfirmed");
  if (!ctx) {
    out.add("context_unavailable");
    return ordered(out);
  }
  if (v.schoolId !== null) {
    if (!ctx.school) out.add("school_not_found");
    else {
      if (ctx.school.verification === "suspended") out.add("school_suspended");
      if (!ctx.school.municipalityEnabled) out.add("municipality_not_enabled");
    }
  }
  if (!ctx.gradeSlug) out.add("grade_unresolved");
  if (v.schoolYear !== null && !ctx.validSchoolYears.includes(v.schoolYear)) out.add("school_year_invalid");
  if (ctx.currentList?.status === "archived") out.add("list_archived");
  return ordered(out);
}

type ResultAlerts = { alerts?: readonly string[]; criticalAlerts?: readonly string[]; items: readonly { alerts?: readonly string[] }[] } | null;

/** Alertas críticos do resultado: (documento ∪ itens) ∩ configuração, mais o que a extração já marcou como crítico. */
export function criticalAlertsIn(result: ResultAlerts, criticalConfig: readonly string[]): string[] {
  if (!result) return [];
  const all = [...(result.alerts ?? []), ...result.items.flatMap((i) => i.alerts ?? [])];
  const hit = all.filter((a) => criticalConfig.includes(a));
  return [...new Set([...hit, ...(result.criticalAlerts ?? [])])];
}
