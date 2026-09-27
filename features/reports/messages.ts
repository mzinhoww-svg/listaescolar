import { REPORT_ERROR_CODES, ReportError, type ReportErrorCode } from "./errors";

export { REPORT_ERROR_CODES };

const BY_CODE: Record<ReportErrorCode | "desconhecido", string> = {
  forbidden: "Você não tem acesso a esta ação.",
  not_found: "Denúncia não encontrada.",
  target_not_found: "Não foi possível denunciar: a lista não existe mais ou não está publicada.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  invalid_state: "Esta denúncia não está mais nesse estado.",
  already_exists: "Você já tem uma denúncia em análise para este item.",
  rate_limited: "Você atingiu o limite de denúncias por hoje. Tente de novo mais tarde.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem do `?erro=<código>`: só códigos conhecidos viram texto; qualquer outra coisa vira a genérica (nunca eco). */
export function reportErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

export function reportErrorCode(error: unknown): ReportErrorCode | "desconhecido" {
  if (error instanceof ReportError && error.code !== "database") return error.code;
  return "desconhecido";
}
