/** Códigos estáveis de erro da cobrança (hints do banco + alguns só de app). */
export const BILLING_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_plan",
  "billing_required",
  "billing_unavailable",
  "stationery_unavailable",
  "provider_invalid",
  "consent_required",
  "amount_mismatch",
  "invalid_state",
  "installments_unavailable",
  "payments_unavailable",
  "database",
] as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: BillingErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}
