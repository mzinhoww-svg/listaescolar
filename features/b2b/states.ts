// Estados do parceiro B2B (S24). Espelha a matriz de `public.b2b_partner_decide` (0501); um teste de repositório
// compara TS × SQL tentando cada transição no banco.

export const PARTNER_STATUSES = ["pending", "sandbox", "active", "rejected", "suspended"] as const;
export type B2bPartnerStatus = (typeof PARTNER_STATUSES)[number];

type Edge = readonly [B2bPartnerStatus, B2bPartnerStatus];

export const PARTNER_TRANSITIONS: readonly Edge[] = [
  ["pending", "sandbox"],
  ["pending", "active"],
  ["pending", "rejected"],
  ["sandbox", "active"],
  ["sandbox", "suspended"],
  ["active", "sandbox"],
  ["active", "suspended"],
  ["suspended", "sandbox"],
  ["suspended", "active"],
];

export function canTransitionPartner(from: B2bPartnerStatus, to: B2bPartnerStatus): boolean {
  return PARTNER_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function isTerminalPartnerStatus(status: B2bPartnerStatus): boolean {
  return status === "rejected";
}

/** Decisões que exigem plano + limites de sandbox (`test_*`). */
export function requiresSandboxLimits(to: B2bPartnerStatus): boolean {
  return to === "sandbox" || to === "active";
}

/** Só `active` exige também os limites de produção (`live_*`). */
export function requiresLiveLimits(to: B2bPartnerStatus): boolean {
  return to === "active";
}

/** `rejected` e `suspended` exigem motivo. */
export function requiresReason(to: B2bPartnerStatus): boolean {
  return to === "rejected" || to === "suspended";
}

export type ApiKeyEnvironment = "test" | "live";

/** Ambiente disponível para o parceiro no estado atual (mesma regra de `b2b_key_lookup`/`b2b_rate_consume`):
 * `test` em sandbox ou active; `live` só em active. */
export function environmentAllowed(environment: ApiKeyEnvironment, status: B2bPartnerStatus): boolean {
  if (environment === "test") return status === "sandbox" || status === "active";
  return status === "active";
}

/** Suspender ou rejeitar revoga TODAS as chaves; rebaixar `active -> sandbox` revoga só as `live`. */
export function keysRevokedOnTransition(from: B2bPartnerStatus, to: B2bPartnerStatus): "all" | ApiKeyEnvironment | null {
  if (to === "suspended" || to === "rejected") return "all";
  if (from === "active" && to === "sandbox") return "live";
  return null;
}
