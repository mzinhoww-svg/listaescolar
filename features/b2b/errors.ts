// Códigos de erro do domínio B2B (S24): serviço/repositório (ação do dono/admin no portal) e API pública `/v1`.
// Os dois conjuntos são deliberadamente separados: a API nunca deixa passar `hint` de banco, SQL ou stack (Global
// Constraints); o serviço mapeia o `hint` das funções para estes códigos estáveis.

export const B2B_SERVICE_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_state",
  "transition_not_allowed",
  "duplicate_cnpj",
  "already_member",
  "consent_required",
  "scope_not_allowed",
  "environment_not_allowed",
  "too_many_keys",
  "key_not_active",
  "service_unavailable",
  "database",
] as const;
export type B2bServiceErrorCode = (typeof B2B_SERVICE_ERROR_CODES)[number];

export class B2bServiceError extends Error {
  constructor(
    message: string,
    readonly code: B2bServiceErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "B2bServiceError";
  }
}

/** `hint` estável das funções SQL (0501) -> código do serviço. */
export const B2B_HINT_CODES: Readonly<Record<string, B2bServiceErrorCode>> = {
  forbidden: "forbidden",
  invalid_input: "invalid_input",
  invalid_state: "invalid_state",
  transition_not_allowed: "transition_not_allowed",
  not_found: "not_found",
  duplicate_cnpj: "duplicate_cnpj",
  already_member: "already_member",
  consent_required: "consent_required",
  scope_not_allowed: "scope_not_allowed",
  environment_not_allowed: "environment_not_allowed",
  too_many_keys: "too_many_keys",
  key_not_active: "key_not_active",
};

/** Causa do erro do banco: pelo `hint`; sem hint, por SQLSTATE (mesmo padrão de `features/stationeries/repository.ts`). */
export function b2bDbErrorCode(error: { code?: string; hint?: string | null }): B2bServiceErrorCode {
  if (error.hint && Object.hasOwn(B2B_HINT_CODES, error.hint)) return B2B_HINT_CODES[error.hint] ?? "database";
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

// ---------------------------------------------------------------------------
// API pública /v1 (envelope de erro do contrato HTTP)
// ---------------------------------------------------------------------------
export const B2B_API_ERROR_CODES = [
  "invalid_key",
  "insufficient_scope",
  "not_found",
  "invalid_request",
  "payload_too_large",
  "unsupported_media_type",
  "method_not_allowed",
  "rate_limited",
  "service_unavailable",
  "internal_error",
] as const;
export type B2bApiErrorCode = (typeof B2B_API_ERROR_CODES)[number];

export const B2B_API_ERROR_STATUS: Readonly<Record<B2bApiErrorCode, number>> = {
  invalid_key: 401,
  insufficient_scope: 403,
  not_found: 404,
  invalid_request: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  method_not_allowed: 405,
  rate_limited: 429,
  service_unavailable: 503,
  internal_error: 500,
};

export type ApiErrorDetail = { path: string; code: string };

/** Erro que um `impl` de endpoint lança; o `handler` mapeia para o envelope e o status HTTP certos. Nunca leva o
 * valor recebido (só `path` e o código da issue do Zod, quando houver). */
export class B2bApiError extends Error {
  constructor(
    readonly code: B2bApiErrorCode,
    message?: string,
    readonly details?: readonly ApiErrorDetail[],
  ) {
    super(message ?? code);
    this.name = "B2bApiError";
  }
}
