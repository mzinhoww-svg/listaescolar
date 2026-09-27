// Códigos de erro do domínio de webhooks (S25), mesmo padrão de `features/b2b/errors.ts`.

export const WEBHOOK_SERVICE_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_state",
  "too_many_endpoints",
  "service_unavailable",
  "database",
] as const;
export type WebhookServiceErrorCode = (typeof WEBHOOK_SERVICE_ERROR_CODES)[number];

export class WebhookServiceError extends Error {
  constructor(
    message: string,
    readonly code: WebhookServiceErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "WebhookServiceError";
  }
}

const HINT_CODES: Readonly<Record<string, WebhookServiceErrorCode>> = {
  forbidden: "forbidden",
  not_found: "not_found",
  invalid_input: "invalid_input",
  invalid_state: "invalid_state",
  too_many_endpoints: "too_many_endpoints",
};

export function webhookDbErrorCode(error: { code?: string; hint?: string | null }): WebhookServiceErrorCode {
  if (error.hint && Object.hasOwn(HINT_CODES, error.hint)) return HINT_CODES[error.hint] ?? "database";
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514":
    case "23505":
      return "invalid_input";
    default:
      return "database";
  }
}
