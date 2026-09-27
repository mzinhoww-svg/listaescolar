/** Códigos estáveis de erro do domínio de listas salvas (S15). */
export const SAVED_LIST_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_input",
  "student_not_found",
  "list_not_published",
  "already_saved",
  "limit",
  "database",
] as const;
export type SavedListErrorCode = (typeof SAVED_LIST_ERROR_CODES)[number];

export class SavedListError extends Error {
  constructor(
    message: string,
    readonly code: SavedListErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "SavedListError";
  }
}
