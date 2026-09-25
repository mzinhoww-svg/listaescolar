/**
 * Matriz de estados da lista (spec S05). Espelha `public.list_transition_allowed` na migration 0103;
 * `tests/lists/repository.test.ts` compara os 100 pares com o banco real.
 */
export const LIST_STATES = [
  "draft",
  "submitted",
  "processing",
  "processing_async",
  "review_needed",
  "human_review",
  "approved",
  "published",
  "archived",
  "rejected",
] as const;

export type ListState = (typeof LIST_STATES)[number];

export const LIST_TRANSITIONS: Readonly<Record<ListState, readonly ListState[]>> = {
  draft: ["submitted"],
  submitted: ["processing"],
  processing: ["processing_async", "review_needed", "human_review", "approved", "rejected"],
  processing_async: ["processing", "review_needed", "human_review", "approved", "rejected"],
  review_needed: ["human_review", "approved", "rejected"],
  human_review: ["approved", "rejected"],
  approved: ["published"],
  published: ["archived"],
  rejected: ["draft"],
  archived: [],
};

/** Destino válido na matriz, mas que só a função de publicação (com a versão) pode aplicar. */
export const PUBLISH_ONLY_TARGET: ListState = "published";

export class InvalidListTransitionError extends Error {
  constructor(
    readonly from: ListState,
    readonly to: ListState,
  ) {
    super(`Transição de lista inválida: ${from} -> ${to}`);
    this.name = "InvalidListTransitionError";
  }
}

export function canTransition(from: ListState, to: ListState): boolean {
  return LIST_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ListState, to: ListState): void {
  if (!canTransition(from, to)) throw new InvalidListTransitionError(from, to);
}
