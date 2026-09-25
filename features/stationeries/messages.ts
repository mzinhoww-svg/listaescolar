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
  reason_required: "Informe o motivo.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
};

/** Mensagem para o usuário; o detalhe técnico fica no log do servidor. */
export function repositoryErrorMessage(error: unknown): string {
  // Duck typing: `StationeryRepositoryError` vive em módulo server-only; aqui só lemos o `code`.
  if (error instanceof Error && error.name === "StationeryRepositoryError") {
    const code = (error as Error & { code?: string }).code ?? "";
    return BY_CODE[code] ?? "Não foi possível concluir agora. Tente de novo.";
  }
  return "Não foi possível concluir agora. Tente de novo.";
}
