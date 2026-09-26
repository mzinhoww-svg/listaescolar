// Limites do domínio de cobrança (S21): espelham os CHECKs de `supabase/migrations/0401_billing.sql`. Nenhum valor de
// NEGÓCIO (preço, cota, parcela, mês) mora aqui — isso vem sempre de `plans`/filhas. Só os limites de VALIDAÇÃO.

/** Teto de qualquer valor em centavos (faixa, pacote, passe, parcela): R$ 100.000,00, igual ao CHECK do banco. */
export const BILLING_MAX_AMOUNT_CENTS = 10_000_000;
export const BILLING_MIN_AMOUNT_CENTS = 1;

export const FREE_LEADS_MIN = 0;
export const FREE_LEADS_MAX = 10_000;

export const FREE_LEADS_VALIDITY_MIN_DAYS = 1;
export const FREE_LEADS_VALIDITY_MAX_DAYS = 3650;

export const PASS_INSTALLMENTS_MIN = 1;
export const PASS_INSTALLMENTS_MAX = 3;

export const SEASON_MONTH_MIN = 1;
export const SEASON_MONTH_MAX = 12;

export const PACKAGES_MIN = 1;
export const PACKAGES_MAX = 6;

/** `leads.item_count`: as faixas de preço precisam cobrir 1..300 sem buraco nem sobreposição. */
export const ITEM_COUNT_MIN = 1;
export const ITEM_COUNT_MAX = 300;

/** Centavos por real (só fator de conversão; nunca preço). */
export const CENTS_PER_BRL = 100;

/** Validade técnica (não é preço/prazo de negócio) da cobrança fake/demo em memória; o Pix real usa `PIX_CHARGE_TTL_SECONDS`. */
export const DEFAULT_CHARGE_TTL_SECONDS = 3600;

/**
 * Revisão de segurança: o cron de reconciliação (`/api/cron/billing-reconcile`) processa no máximo um LOTE por
 * execução e para se estourar o ORÇAMENTO de tempo, devolvendo o que já fez — a próxima execução (diária) continua
 * de onde parou (a busca é sempre pelas faturas mais antigas primeiro). Evita um cron sem fim com muitas faturas
 * abertas (custo de execução sem teto e risco de timeout da função).
 */
export const RECONCILE_BATCH_SIZE = 200;
export const RECONCILE_TIME_BUDGET_MS = 20_000;

/**
 * Revisão de segurança: no BACEN v2 a cob imediata continua `ATIVA` mesmo depois de `calendario.expiracao` vencer —
 * expirar não é um status, é uma conta (criação + validade). A margem é a favor do pagador (só considera vencida um
 * pouco DEPOIS do prazo), técnica para absorver diferença de relógio entre o nosso servidor e o PSP.
 */
export const PIX_EXPIRY_MARGIN_MS = 5_000;

/** Fuso em que a temporada e os vencimentos são calculados (SQL usa o mesmo nome). */
export const BILLING_TIMEZONE = "America/Cuiaba";
