// Faixas de validação do domínio B2B (S24). Espelham os CHECKs de `0501_b2b_partners_api.sql`; nenhum limite de
// rate limit é fixado aqui além destas faixas — o número real vem sempre da linha do parceiro (definido pelo admin).

export type Range = { readonly min: number; readonly max: number };
/** Faixa com um valor de partida sugerido na UI — `default` NÃO é o mínimo permitido (`min` já cobre isso); é só
 * um ponto de partida razoável para quem preenche o formulário sem pensar num número (Admin15, revisão de
 * segurança da Task 3: `defaultValue={range.min}` deixava o parceiro aprovado com 1 req/min e 1 req/dia). */
export type RangeWithDefault = Range & { readonly default: number };

export const PARTNER_TEST_RATE_PER_MINUTE: RangeWithDefault = { min: 1, max: 10_000, default: 60 };
export const PARTNER_TEST_RATE_PER_DAY: RangeWithDefault = { min: 1, max: 10_000_000, default: 1_000 };
export const PARTNER_LIVE_RATE_PER_MINUTE: RangeWithDefault = { min: 1, max: 10_000, default: 60 };
export const PARTNER_LIVE_RATE_PER_DAY: RangeWithDefault = { min: 1, max: 10_000_000, default: 2_000 };

/** Carência da rotação de chaves (dias). Padrão 7 (Ruling S24 · Task 2). */
export const KEY_ROTATION_GRACE_DAYS: RangeWithDefault = { min: 1, max: 30, default: 7 };

/** No máximo duas chaves utilizáveis por (parceiro, ambiente): atual + anterior em carência. */
export const MAX_USABLE_KEYS_PER_ENVIRONMENT = 2;

/** `POST /v1/carts/match`: 1..5000 SKUs por requisição. */
export const CART_MATCH_MAX_SKUS: Range = { min: 1, max: 5000 };
export const CART_MATCH_SKU_LENGTH: Range = { min: 1, max: 64 };
export const CART_MATCH_NAME_LENGTH: Range = { min: 1, max: 200 };
export const CART_MATCH_SKU_PATTERN = /^[A-Za-z0-9._:/-]+$/;
/** Corpo do match: ≤ 1 MB. */
export const CART_MATCH_MAX_BODY_BYTES = 1_000_000;

/** Paginação: escolas e listas (padrão 50, máximo 100); itens (padrão 200, máximo 500). */
export const SCHOOLS_LIST_LIMIT = { default: 50, max: 100 };
export const SCHOOL_LISTS_LIMIT = { default: 50, max: 100 };
export const LIST_ITEMS_LIMIT = { default: 200, max: 500 };

/** `q` (busca por nome de escola): 2..80 caracteres. */
export const SCHOOL_QUERY_LENGTH: Range = { min: 2, max: 80 };

/** Timeout por requisição ao banco. Passado disso, o pipeline aborta de VERDADE um `AbortController` (achado 3,
 * revisão de segurança independente): a chamada real (`realLookupKey`/`realConsumeRate`) encaminha esse
 * `AbortSignal` para `.abortSignal()` do supabase-js, cancelando a consulta no Postgres/PostgREST — não é mais só
 * uma race que ignora a resposta tardia enquanto a consulta continua rodando em segundo plano. Responde `503
 * service_unavailable`. */
export const API_DB_TIMEOUT_MS = 8_000;

export function inRange(value: number, range: Range): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}
