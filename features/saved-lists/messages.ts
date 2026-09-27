import type { SavedListErrorCode } from "./errors";

export const SAVED_LIST_ERROR_MESSAGES: Record<SavedListErrorCode, string> = {
  forbidden: "Você não pode fazer isso.",
  not_found: "Lista salva não encontrada.",
  invalid_input: "Confira os dados.",
  student_not_found: "Escolha um aluno seu.",
  list_not_published: "Só é possível salvar uma lista publicada.",
  already_saved: "Você já salvou esta lista para este aluno.",
  limit: "Limite de listas salvas por família atingido.",
  database: "Não foi possível salvar agora. Tente de novo.",
};

export function savedListErrorMessage(code: SavedListErrorCode): string {
  return SAVED_LIST_ERROR_MESSAGES[code];
}
