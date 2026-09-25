/** Erro fixo da revisão: o texto do Postgres nunca sobe para a tela. */
export class ReviewError extends Error {
  constructor(readonly code: "forbidden" | "invalid_input" | "not_found" | "unavailable") {
    super(code);
    this.name = "ReviewError";
  }
}
