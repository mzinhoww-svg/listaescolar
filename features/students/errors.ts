/** Códigos estáveis de erro do domínio de estudantes (S15). */
export const STUDENT_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "nickname_has_surname",
  "nickname_invalid",
  "school_not_found",
  "grade_not_found",
  "limit",
  "database",
] as const;
export type StudentErrorCode = (typeof STUDENT_ERROR_CODES)[number];

export class StudentError extends Error {
  constructor(
    message: string,
    readonly code: StudentErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "StudentError";
  }
}
