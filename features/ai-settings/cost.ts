/**
 * Custo de IA por lista (S28, M02). Só usa o que o provedor informou e a taxa que o operador cadastrou em
 * `ai_settings.usd_brl_rate`; sem taxa ou com custo parcial, devolve `null` em reais. Nunca inventa preço de modelo.
 */

/** Micros de dólar (1 US$ = 1.000.000) para centavos de real; sem taxa válida, `null`. */
export function usdMicrosToBrlCents(micros: number, rate: number | null): number | null {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(micros) || micros < 0) return null;
  return Math.round((micros * rate) / 10_000);
}

export type CostRow = { provider_cost_usd_micros: number | null };

export type ListCostSummary = { usdMicros: number; unknownRows: number; brlCents: number | null };

/**
 * Soma o custo conhecido de uma lista. Com qualquer linha sem custo (`unknownRows > 0`) o total em reais é `null`:
 * custo parcial nunca aparece como total.
 */
export function summarizeListCost(rows: CostRow[], rate: number | null): ListCostSummary {
  let usdMicros = 0;
  let unknownRows = 0;
  for (const r of rows) {
    if (r.provider_cost_usd_micros === null) unknownRows += 1;
    else usdMicros += r.provider_cost_usd_micros;
  }
  return { usdMicros, unknownRows, brlCents: unknownRows > 0 ? null : usdMicrosToBrlCents(usdMicros, rate) };
}

export type EntityCostRow = { providerCostUsdMicros: number; unknownCostRows: number };
type Trio = { mean: number; p95: number; max: number };
export type CostPanelStats = {
  lists: number;
  /** Listas em que TODA linha de decisão tem custo informado: só estas entram nas estatísticas. */
  completeLists: number;
  partialLists: number;
  usdMicros: Trio | null;
  brlCents: Trio | null;
  rate: number | null;
};

/** Posto mais próximo (nearest-rank) sobre valores já ordenados. */
const p95Of = (sorted: number[]): number => sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] as number;

/**
 * Média, p95 e máximo do custo por lista. Lista com qualquer linha sem custo (parcial) fica de fora e é contada à
 * parte; sem lista completa ou sem taxa, o que não dá para saber vira `null` ("indisponível"), nunca zero.
 */
export function costPanelStats(rows: EntityCostRow[], rate: number | null): CostPanelStats {
  const complete = rows.filter((r) => r.unknownCostRows === 0);
  const base = { lists: rows.length, completeLists: complete.length, partialLists: rows.length - complete.length, rate };
  if (complete.length === 0) return { ...base, usdMicros: null, brlCents: null };
  const values = complete.map((r) => r.providerCostUsdMicros).sort((a, b) => a - b);
  const usdMicros: Trio = {
    mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    p95: p95Of(values),
    max: values[values.length - 1] as number,
  };
  const conv = (m: number) => usdMicrosToBrlCents(m, rate);
  const [mean, p95, max] = [conv(usdMicros.mean), conv(usdMicros.p95), conv(usdMicros.max)];
  return { ...base, usdMicros, brlCents: mean === null || p95 === null || max === null ? null : { mean, p95, max } };
}
