// Escopos da chave de API (S24). Espelha `public.b2b_allowed_scopes(text)` (0501); um teste de repositório compara
// TS × SQL para os três tipos de parceiro.

export const ALLOWED_SCOPES = ["schools:read", "lists:read", "carts:match"] as const;
export type B2bScope = (typeof ALLOWED_SCOPES)[number];

export function isB2bScope(value: unknown): value is B2bScope {
  return typeof value === "string" && (ALLOWED_SCOPES as readonly string[]).includes(value);
}

export const PARTNER_TYPES = ["retailer", "brand", "edtech"] as const;
export type B2bPartnerType = (typeof PARTNER_TYPES)[number];

/** Escopos permitidos por tipo. Varejista: os três. Marca e EdTech/ERP: sem `carts:match` (publicar lista pela API
 * não está no PLAN desta fatia; Ruling S24 · Planejamento). */
export const SCOPES_BY_PARTNER_TYPE: Readonly<Record<B2bPartnerType, readonly B2bScope[]>> = {
  retailer: ["schools:read", "lists:read", "carts:match"],
  brand: ["schools:read", "lists:read"],
  edtech: ["schools:read", "lists:read"],
};

export function scopesForPartnerType(type: B2bPartnerType): readonly B2bScope[] {
  return SCOPES_BY_PARTNER_TYPE[type];
}

export function isScopeAllowedForType(type: B2bPartnerType, scope: B2bScope): boolean {
  return scopesForPartnerType(type).includes(scope);
}

/** Escopo exigido por cada endpoint do registro (id do contrato -> escopo). Fonte única para `defineEndpoint`
 * e para a documentação; um teste de contrato confere que todo `ENDPOINTS[].scope` bate com este mapa. */
const SCOPE_BY_ENDPOINT: Readonly<Record<string, B2bScope>> = {
  "schools.list": "schools:read",
  "schools.get": "schools:read",
  "schools.lists": "lists:read",
  "lists.get": "lists:read",
  "lists.items": "lists:read",
  "carts.match": "carts:match",
};

export function scopeFor(endpointId: string): B2bScope | undefined {
  return SCOPE_BY_ENDPOINT[endpointId];
}
