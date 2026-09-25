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
