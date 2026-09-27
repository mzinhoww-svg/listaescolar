/** Códigos estáveis de erro do domínio de denúncias (S16). */
export const REPORT_ERROR_CODES = [
  "forbidden",
  "not_found",
  "target_not_found",
  "invalid_input",
  "invalid_state",
  "already_exists",
  "rate_limited",
  "database",
] as const;
export type ReportErrorCode = (typeof REPORT_ERROR_CODES)[number];

export class ReportError extends Error {
  constructor(
    message: string,
    readonly code: ReportErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "ReportError";
  }
}
