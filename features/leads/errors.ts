/** Códigos estáveis de erro do domínio de leads (o `?erro=` da URL carrega só estes valores). */
export const LEAD_ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_state",
  "transition_not_allowed",
  "rate_limited",
  "stationery_unavailable",
  "out_of_area",
  "expired",
  "amount_invalid",
  "reason_required",
  "actor_invalid",
  "limit_exceeded",
  "consent_required",
  "invalid_input",
  "list_unavailable",
  "whatsapp_unavailable",
  "database",
  // S21 (cobrança): o gatilho de débito na entrega recusa o lead sem passe/grátis/saldo (billing_required) ou sem
  // plano ativo (billing_unavailable). O pai nunca vê motivo de cobrança — mesma mensagem neutra das duas.
  "billing_required",
  "billing_unavailable",
  // S23 (inadimplência): papelaria pausada por atraso além de `block_days` (payout_delinquency_status). Mesma
  // mensagem neutra das duas causas de cobrança acima — o pai nunca vê "papelaria inadimplente".
  "delinquency_blocked",
] as const;
export type LeadErrorCode = (typeof LEAD_ERROR_CODES)[number];

export class LeadError extends Error {
  constructor(
    message: string,
    readonly code: LeadErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "LeadError";
  }
}
