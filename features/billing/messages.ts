import { BILLING_ERROR_CODES, BillingError, type BillingErrorCode } from "./errors";

export { BILLING_ERROR_CODES };

const BY_CODE: Record<BillingErrorCode | "desconhecido", string> = {
  forbidden: "Você não tem acesso a esta papelaria.",
  not_found: "Não encontrado.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  invalid_plan: "Plano inválido. Revise os valores e tente de novo.",
  billing_required: "Sem saldo suficiente. Compre créditos ou assine o passe de temporada.",
  billing_unavailable: "Cobrança indisponível no momento. Tente de novo mais tarde.",
  stationery_unavailable: "Esta papelaria não está disponível agora.",
  provider_invalid: "Forma de pagamento não disponível para esta papelaria.",
  consent_required: "Para continuar, marque que leu e aceita as condições de cobrança.",
  amount_mismatch: "O valor pago não corresponde ao valor da fatura.",
  invalid_state: "Esta fatura não pode receber esta ação agora.",
  installments_unavailable: "Esse número de parcelas não cabe até o fim da temporada. Escolha menos parcelas.",
  payments_unavailable: "Pagamento via Pix indisponível no momento.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem do `?erro=<código>`: só códigos conhecidos viram texto; qualquer outra coisa vira a genérica (nunca eco). */
export function billingErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

export function billingErrorCode(error: unknown): BillingErrorCode | "desconhecido" {
  if (error instanceof BillingError && error.code !== "database") return error.code;
  return "desconhecido";
}
