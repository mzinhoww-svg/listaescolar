import { LEAD_ERROR_CODES, LeadError, type LeadErrorCode } from "./errors";

export { LEAD_ERROR_CODES };

const BY_CODE: Record<LeadErrorCode | "desconhecido", string> = {
  not_found: "Pedido não encontrado.",
  forbidden: "Você não tem acesso a este pedido.",
  invalid_state: "Esta ação não está disponível no status atual do pedido.",
  transition_not_allowed: "Esta mudança de status não é permitida agora.",
  rate_limited: "Muitos pedidos em pouco tempo. Aguarde um pouco e tente de novo.",
  stationery_unavailable: "Esta papelaria não está disponível para novos pedidos.",
  out_of_area: "Esta papelaria não atende a sua região.",
  expired: "Este pedido expirou.",
  amount_invalid: "Valor inválido. Use o formato 1.234,50.",
  reason_required: "Informe o motivo.",
  actor_invalid: "Não foi possível confirmar quem está fazendo esta ação. Entre de novo.",
  limit_exceeded: "Passou do limite permitido. Tente de novo mais tarde.",
  consent_required: "Para pedir a cotação é preciso marcar o consentimento.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  list_unavailable: "Cotação indisponível para esta lista.",
  whatsapp_unavailable: "O WhatsApp desta papelaria não está disponível agora.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem do `?erro=<código>`: só códigos conhecidos viram texto; qualquer outra coisa vira a genérica (nunca eco). */
export function errorMessageForCode(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

/** Código para o `?erro=`; erro que não é `LeadError` (ou `database`) vira `desconhecido`. */
export function leadErrorCode(error: unknown): LeadErrorCode | "desconhecido" {
  if (error instanceof LeadError && error.code !== "database") return error.code;
  return "desconhecido";
}
