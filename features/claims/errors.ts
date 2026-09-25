import type { ClaimErrorCode } from "./messages";

/**
 * Erros do repositório de reivindicações. Erros do banco viram `ClaimRepositoryError` com código fixo:
 * a mensagem do Postgres nunca sobe para a tela.
 */
export class ClaimRepositoryError extends Error {
  constructor(
    readonly code: ClaimErrorCode,
    message: string,
    readonly pgCode?: string,
  ) {
    super(message);
    this.name = "ClaimRepositoryError";
  }
}

export const fail = (code: ClaimErrorCode, what: string, pg?: string): ClaimRepositoryError =>
  new ClaimRepositoryError(code, `${what}: ${code}`, pg);

export type PgError = { code?: string; message: string };

/** errcode + texto estável da função -> código fixo. O texto só classifica; nunca é exibido. */
export function mapError(e: PgError, what: string): ClaimRepositoryError {
  switch (e.code) {
    case "P0002":
      return fail("not_found", what, e.code);
    case "42501":
      return fail("forbidden", what, e.code);
    case "22023":
      return fail("invalid_argument", what, e.code);
    case "23505":
      if (/claims_one_(open|approved)_idx/.test(e.message)) return fail("conflict", what, e.code);
      return fail("database", what, e.code);
    case "23514":
      if (/escola (suspensa|verificada)|município não habilitado|escola .* não aceita/.test(e.message)) return fail("school_closed", what, e.code);
      if (/^aguarde/.test(e.message)) return fail("wait", what, e.code);
      if (/^limite de/.test(e.message)) return fail("limit", what, e.code);
      if (/^e-mail da conta/.test(e.message)) return fail("account_email", what, e.code);
      if (/^aprovar exige canal/.test(e.message)) return fail("approval_needs_channel", what, e.code);
      if (/^aprovar exige ao menos uma evid/.test(e.message)) return fail("approval_needs_evidence", what, e.code);
      return fail("invalid_state", what, e.code);
    default:
      return fail("database", what, e.code);
  }
}
