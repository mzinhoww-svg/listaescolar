import { PAYOUT_ERROR_CODES, PayoutError, type PayoutErrorCode } from "./errors";

export { PAYOUT_ERROR_CODES };

const BY_CODE: Record<PayoutErrorCode | "desconhecido", string> = {
  forbidden: "Você não tem acesso a esta ação.",
  not_found: "Registro não encontrado.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  invalid_state: "Esta ação não está disponível agora.",
  payout_unavailable: "A comissão ainda não foi configurada. Publique a configuração antes de confirmar vendas.",
  nothing_due: "Não há repasse pendente para gerar um lote agora.",
  already_settled: "Este repasse já entrou num lote e não pode ser estornado por aqui; corrija manualmente fora do sistema.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem do `?erro=<código>`: só códigos conhecidos viram texto; qualquer outra coisa vira a genérica (nunca eco). */
export function errorMessageForCode(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

/** Código para o `?erro=`; erro que não é `PayoutError` (ou `database`) vira `desconhecido`. */
export function payoutErrorCode(error: unknown): PayoutErrorCode | "desconhecido" {
  if (error instanceof PayoutError && error.code !== "database") return error.code;
  return "desconhecido";
}
