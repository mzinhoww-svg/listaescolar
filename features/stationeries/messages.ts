import type { StationeryStatus } from "./state";

export const STATUS_LABEL: Record<StationeryStatus, string> = {
  signup: "Cadastro iniciado",
  accreditation: "Credenciamento",
  under_review: "Em análise",
  approved: "Aprovada",
  active: "Ativa",
  paused: "Pausada",
  suspended: "Suspensa",
  rejected: "Recusada",
};

export const ROLE_BLOCK_MESSAGE =
  "Só uma conta de responsável (pai, mãe ou responsável legal) pode cadastrar uma papelaria. Entre com essa conta para continuar.";

const BY_CODE: Record<string, string> = {
  cnpj_taken: "Já existe uma papelaria cadastrada com este CNPJ.",
  already_owner: "Esta conta já tem uma papelaria cadastrada.",
  not_found: "Papelaria não encontrada.",
  forbidden: "Você não tem acesso a esta papelaria.",
  invalid_state: "Esta ação não está disponível no status atual da papelaria.",
  transition_not_allowed: "Esta mudança de status não é permitida agora.",
  precondition_failed: "Faltam dados obrigatórios do cadastro (razão social, bairro, WhatsApp, aceite ou área de atendimento).",
  actor_invalid: "Não foi possível confirmar quem está fazendo esta ação. Entre de novo.",
  reason_required: "Informe o motivo.",
  consent_required: "É preciso aceitar o tratamento de dados para continuar.",
  limit_exceeded: "Passou do limite permitido. Divida em partes menores e tente de novo.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  // códigos de validação das telas (o `?erro=` nunca carrega texto livre)
  invalido: "Ação inválida.",
  preco_invalido: "Preço inválido. Use o formato 12,90.",
  item_invalido: "Item inválido. Revise o nome e o preço.",
  nome_formula: "O nome do item não pode começar com =, +, - ou @.",
  areas_invalidas: "Cada bairro deve ter de 2 a 120 caracteres (até 100 bairros).",
  desconhecido: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem do `?erro=<código>` da URL: só códigos conhecidos viram texto; qualquer outra coisa vira a mensagem genérica. */
export function errorMessageForCode(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(BY_CODE, code) ? (BY_CODE[code] ?? BY_CODE.desconhecido ?? null) : (BY_CODE.desconhecido ?? null);
}

/** Código do erro do repositório (para redirecionar com `?erro=<código>`). */
export function repositoryErrorCode(error: unknown): string {
  if (error instanceof Error && error.name === "StationeryRepositoryError") {
    const code = (error as Error & { code?: string }).code ?? "";
    return Object.hasOwn(BY_CODE, code) ? code : "desconhecido";
  }
  return "desconhecido";
}

/** Mensagem para o usuário; o detalhe técnico fica no log do servidor. */
export function repositoryErrorMessage(error: unknown): string {
  // Duck typing: `StationeryRepositoryError` vive em módulo server-only; aqui só lemos o `code`.
  if (error instanceof Error && error.name === "StationeryRepositoryError") {
    return errorMessageForCode(repositoryErrorCode(error)) ?? BY_CODE.desconhecido ?? "";
  }
  return BY_CODE.desconhecido ?? "";
}
