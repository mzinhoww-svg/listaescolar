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
