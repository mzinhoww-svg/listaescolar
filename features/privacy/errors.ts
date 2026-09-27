/** Códigos estáveis de erro do domínio de privacidade (LGPD, S17). */
export const PRIVACY_ERROR_CODES = ["not_found", "forbidden", "invalid_input", "database"] as const;
export type PrivacyErrorCode = (typeof PRIVACY_ERROR_CODES)[number];

export class PrivacyError extends Error {
  constructor(
    message: string,
    readonly code: PrivacyErrorCode,
  ) {
    super(message);
    this.name = "PrivacyError";
  }
}
