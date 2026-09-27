// Códigos de erro do domínio de campanhas B2B (S26). Mesmo padrão de features/b2b/errors.ts: o `hint` estável das
// funções SQL (0503) mapeia para um código do serviço; sem hint, cai no SQLSTATE.

export const CAMPAIGN_SERVICE_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "transition_not_allowed",
  "budget_exhausted",
  "duplicate_period",
  "database",
] as const;
export type CampaignServiceErrorCode = (typeof CAMPAIGN_SERVICE_ERROR_CODES)[number];

export class CampaignServiceError extends Error {
  constructor(
    message: string,
    readonly code: CampaignServiceErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "CampaignServiceError";
  }
}

const HINT_CODES: Readonly<Record<string, CampaignServiceErrorCode>> = {
  forbidden: "forbidden",
  not_found: "not_found",
  invalid_input: "invalid_input",
  transition_not_allowed: "transition_not_allowed",
  budget_exhausted: "budget_exhausted",
  duplicate_period: "duplicate_period",
};

export function campaignDbErrorCode(error: { code?: string; hint?: string | null }): CampaignServiceErrorCode {
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
