import type { StudentErrorCode } from "./errors";

/** Mensagem neutra e amigável; nunca expõe SQLSTATE nem detalhe interno. */
export const STUDENT_ERROR_MESSAGES: Record<StudentErrorCode, string> = {
  forbidden: "Você não pode fazer isso.",
  not_found: "Aluno não encontrado.",
  invalid_input: "Confira os dados do aluno.",
  nickname_has_surname: "Use só um apelido, sem sobrenome.",
  nickname_invalid: "Apelido inválido.",
  school_not_found: "Escola não encontrada.",
  grade_not_found: "Escolha uma série.",
  limit: "Limite de alunos cadastrados por família atingido.",
  database: "Não foi possível salvar agora. Tente de novo.",
};

export function studentErrorMessage(code: StudentErrorCode): string {
  return STUDENT_ERROR_MESSAGES[code];
}
