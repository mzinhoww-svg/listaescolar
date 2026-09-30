import { PURCHASE_QUESTION_STATUSES } from "@/features/leads/next-step";
import type { LeadStatus } from "@/features/leads/state";

/**
 * Ruling (S29 T12, UX-027): "Você comprou?" só aparece depois que a papelaria respondeu (valor enviado, espera da resposta da
 * família ou compra combinada) ou, sem resposta, 24 horas depois do pedido. Antes disso a pergunta é prematura e a resposta
 * "Ainda não" seria só ruído; quem já respondeu continua podendo corrigir.
 */
export const MIN_HOURS_BEFORE_SURVEY = 24;

export function surveyAskable(view: { status: string; createdAt: Date; existingAnswer: string | null }, now: Date): boolean {
  if (view.existingAnswer !== null) return true;
  if (PURCHASE_QUESTION_STATUSES.includes(view.status as LeadStatus)) return true;
  return now.getTime() - view.createdAt.getTime() >= MIN_HOURS_BEFORE_SURVEY * 3600 * 1000;
}
