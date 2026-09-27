import { WebhookServiceError, type WebhookServiceErrorCode } from "./errors";

const BY_CODE: Record<WebhookServiceErrorCode | "desconhecido", string> = {
  forbidden: "Você não tem acesso a este parceiro.",
  not_found: "Endpoint ou entrega não encontrado.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  invalid_state: "Esta ação não está disponível no estado atual.",
  too_many_endpoints: "Limite de endpoints atingido. Remova ou reaproveite um existente.",
  service_unavailable: "Configuração de webhooks indisponível no momento.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

export function webhookServiceMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? BY_CODE[code as keyof typeof BY_CODE] : BY_CODE.desconhecido;
}

export function webhookServiceErrorCode(error: unknown): WebhookServiceErrorCode | "desconhecido" {
  if (error instanceof WebhookServiceError && error.code !== "database") return error.code;
  return "desconhecido";
}
