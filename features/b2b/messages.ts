import { B2B_API_ERROR_CODES, B2B_SERVICE_ERROR_CODES, B2bServiceError, type B2bApiErrorCode, type B2bServiceErrorCode } from "./errors";

export { B2B_API_ERROR_CODES, B2B_SERVICE_ERROR_CODES };

/** Mensagens fixas em português do envelope de erro da API `/v1`. Nunca ecoam o valor recebido, SQL ou stack. */
export const B2B_API_MESSAGE: Readonly<Record<B2bApiErrorCode, string>> = {
  invalid_key: "Chave de API inválida.",
  insufficient_scope: "Esta chave não tem permissão para este recurso.",
  not_found: "Recurso não encontrado.",
  invalid_request: "Requisição inválida.",
  payload_too_large: "Corpo da requisição excede o limite permitido.",
  unsupported_media_type: "Tipo de conteúdo não suportado.",
  method_not_allowed: "Método não permitido.",
  rate_limited: "Limite de requisições excedido. Tente de novo mais tarde.",
  service_unavailable: "Serviço indisponível no momento.",
  internal_error: "Não foi possível concluir a requisição.",
};

/** Mensagens do portal (Server Actions do dono/admin). */
const BY_SERVICE_CODE: Record<B2bServiceErrorCode | "desconhecido", string> = {
  forbidden: "Você não tem acesso a este parceiro.",
  not_found: "Parceiro ou chave não encontrado.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  invalid_state: "Esta ação não está disponível no estado atual.",
  transition_not_allowed: "Esta mudança de status não é permitida agora.",
  duplicate_cnpj: "Este CNPJ já está cadastrado.",
  already_member: "Esta conta já está vinculada a um parceiro.",
  consent_required: "Para se cadastrar é preciso aceitar os termos da API.",
  scope_not_allowed: "Este escopo não é permitido para o tipo de parceiro.",
  environment_not_allowed: "Este ambiente não está disponível no estado atual do parceiro.",
  too_many_keys: "Já há duas chaves utilizáveis neste ambiente. Revogue uma antes de criar outra.",
  key_not_active: "Só uma chave ativa pode ser rotacionada.",
  service_unavailable: "Emissão de chaves indisponível no momento.",
  database: "Não foi possível concluir agora. Tente de novo.",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

export function b2bServiceMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_SERVICE_CODE, code) ? BY_SERVICE_CODE[code as keyof typeof BY_SERVICE_CODE] : BY_SERVICE_CODE.desconhecido;
}

/** Código para `?erro=`: erro que não é `B2bServiceError` (ou `database`) vira `desconhecido`. */
export function b2bServiceErrorCode(error: unknown): B2bServiceErrorCode | "desconhecido" {
  if (error instanceof B2bServiceError && error.code !== "database") return error.code;
  return "desconhecido";
}
