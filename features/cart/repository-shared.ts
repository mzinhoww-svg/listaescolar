/**
 * Erro compartilhado por `repository.ts`, `repository-retailers.ts` e `repository-snapshots.ts` (D-057, S18,
 * extraído de `repository.ts`, que tinha 314 linhas).
 */
export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export function fail(what: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${what}: ${error.message}`, error.code);
}
