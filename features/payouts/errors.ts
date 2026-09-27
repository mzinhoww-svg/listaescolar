/** Códigos estáveis de erro do domínio de comissão/repasse/inadimplência (S23). */
export const PAYOUT_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_state",
  "payout_unavailable",
  "nothing_due",
  "already_settled",
  "database",
] as const;
export type PayoutErrorCode = (typeof PAYOUT_ERROR_CODES)[number];

export class PayoutError extends Error {
  constructor(
    message: string,
    readonly code: PayoutErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "PayoutError";
  }
}
