import { CONVERSION_ERROR_CODES, ConversionError, type ConversionErrorCode } from "./errors";

export { CONVERSION_ERROR_CODES };

const BY_CODE: Record<ConversionErrorCode | "desconhecido" | "rating_required", string> = {
  rating_required: "Escolha uma nota de 1 a 5 antes de enviar a avaliação.",
  forbidden: "Você não tem acesso a este pedido.",
  not_found: "Pedido não encontrado.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  invalid_state: "Esta ação não está disponível agora.",
  already_disputed: "Este pedido já foi contestado.",
  dispute_expired: "O prazo de 72 h para contestar este pedido já encerrou.",
  personal_data_rejected: "Remova dados de contato (telefone, e-mail) do comentário antes de enviar.",
  purchase_not_confirmed: "Só é possível avaliar depois de confirmar a compra ou de a papelaria declarar a venda.",
  lead_sold: "Este pedido já foi vendido e não pode mais ser contestado.",
  stationery_unavailable: "Esta papelaria não pode contestar agora.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem do `?erro=<código>`: só códigos conhecidos viram texto; qualquer outra coisa vira a genérica (nunca eco). */
export function errorMessageForCode(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

/** Código para o `?erro=`; erro que não é `ConversionError` (ou `database`) vira `desconhecido`. */
export function conversionErrorCode(error: unknown): ConversionErrorCode | "desconhecido" {
  if (error instanceof ConversionError && error.code !== "database") return error.code;
  return "desconhecido";
}
