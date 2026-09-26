/** Códigos estáveis de erro do domínio de conversão/contestação (S22). */
export const CONVERSION_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_state",
  "already_disputed",
  "dispute_expired",
  "personal_data_rejected",
  "database",
] as const;
export type ConversionErrorCode = (typeof CONVERSION_ERROR_CODES)[number];

export class ConversionError extends Error {
  constructor(
    message: string,
    readonly code: ConversionErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}
