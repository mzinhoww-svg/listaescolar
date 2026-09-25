/**
 * Matriz de estados da reivindicação (S06), por ator. Espelha `public.claim_transition_allowed` na migration 0104;
 * `tests/claims/repository.test.ts` compara as 108 triplas com o banco real e `state.test.ts` com um oráculo escrito à mão.
 */
export const CLAIM_STATUSES = [
  "submitted",
  "awaiting_verification",
  "token_expired",
  "insufficient_evidence",
  "rejected",
  "approved",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_ACTORS = ["claimant", "admin", "system"] as const;
export type ClaimActor = (typeof CLAIM_ACTORS)[number];

export const CLAIM_METHODS = ["institutional_email", "institutional_whatsapp", "documents"] as const;
export type ClaimMethod = (typeof CLAIM_METHODS)[number];

export const CLAIM_TRANSITIONS: Record<ClaimActor, ReadonlyArray<readonly [ClaimStatus, ClaimStatus]>> = {
  claimant: [
    ["submitted", "awaiting_verification"],
    ["token_expired", "awaiting_verification"],
    ["insufficient_evidence", "awaiting_verification"],
  ],
  admin: [
    ["awaiting_verification", "approved"],
    ["awaiting_verification", "insufficient_evidence"],
    ["submitted", "rejected"],
    ["awaiting_verification", "rejected"],
    ["insufficient_evidence", "rejected"],
    ["token_expired", "rejected"],
  ],
  system: [
    ["awaiting_verification", "token_expired"],
    ["submitted", "rejected"],
    ["awaiting_verification", "rejected"],
    ["insufficient_evidence", "rejected"],
    ["token_expired", "rejected"],
  ],
};

/** Reivindicação "aberta": ainda pode mudar (`approved` e `rejected` são terminais). */
export const OPEN_CLAIM_STATUSES: readonly ClaimStatus[] = [
  "submitted",
  "awaiting_verification",
  "token_expired",
  "insufficient_evidence",
];

export class InvalidClaimTransitionError extends Error {
  constructor(
    readonly actor: ClaimActor,
    readonly from: ClaimStatus,
    readonly to: ClaimStatus,
  ) {
    super(`Transição de reivindicação inválida: ${from} -> ${to} (${actor})`);
    this.name = "InvalidClaimTransitionError";
  }
}

export function canTransition(actor: ClaimActor, from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[actor].some(([f, t]) => f === from && t === to);
}

export function assertTransition(actor: ClaimActor, from: ClaimStatus, to: ClaimStatus): void {
  if (!canTransition(actor, from, to)) throw new InvalidClaimTransitionError(actor, from, to);
}
