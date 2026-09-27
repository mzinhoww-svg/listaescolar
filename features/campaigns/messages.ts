import { CampaignServiceError, type CampaignServiceErrorCode } from "./errors";

/** Mensagens fixas em português (portal B2B e admin). Nunca ecoam o valor recebido, SQL ou stack. */
const BY_CODE: Record<CampaignServiceErrorCode | "desconhecido", string> = {
  forbidden: "Você não tem acesso a esta campanha.",
  not_found: "Campanha não encontrada.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  transition_not_allowed: "Esta mudança de status não é permitida agora.",
  budget_exhausted: "O orçamento total desta campanha já foi atingido.",
  duplicate_period: "Já existe um extrato para este período.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

export function campaignServiceMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

export function campaignServiceErrorCode(error: unknown): CampaignServiceErrorCode | "desconhecido" {
  if (error instanceof CampaignServiceError && error.code !== "database") return error.code;
  return "desconhecido";
}
