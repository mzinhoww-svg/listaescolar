import { mulCents, sumCents } from "@/features/cart/money";
import { CATALOG_PRICE_SOURCE, MAX_PRICE_CENTS, type CatalogStock } from "@/features/stationeries/catalog";
import { DEFAULT_LOCAL_QUOTE_MAX_AGE_MS, LOCAL_QUOTE_FUTURE_TOLERANCE_MS } from "@/features/stationeries/local-quote-provider";
import type { LocalCatalogCandidate } from "@/features/stationeries/ports";

export type EstimateItem = { itemKey: string; name: string; quantity: number };
export type StockLabel = "Tenho" | "Em falta" | "não informado";
export type EstimateLine = {
  itemKey: string;
  name: string;
  quantity: number;
  status: "priced" | "unavailable";
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  stock: CatalogStock;
  stockLabel: StockLabel;
  priceUpdatedAt: Date | null;
};
export type Estimate = {
  status: "available" | "partial" | "unavailable";
  lines: EstimateLine[];
  subtotalCents: number | null;
  pricedCount: number;
  totalCount: number;
  source: typeof CATALOG_PRICE_SOURCE | null;
  /** Data mais antiga entre os preços usados (a mais conservadora). */
  asOf: Date | null;
};

function stockLabel(stock: CatalogStock): StockLabel {
  return stock === "in_stock" ? "Tenho" : stock === "out_of_stock" ? "Em falta" : "não informado";
}

/**
 * Estimativa "pelo catálogo da papelaria": só soma item com preço válido, dentro de 30 dias, item ativo e fora de
 * `out_of_stock`, de papelaria `active`. Nunca completa item sem catálogo. Centavos inteiros; estouro vira `null`.
 * Os candidatos são de UMA papelaria.
 */
export function estimateFromCatalog(
  items: readonly EstimateItem[],
  candidates: readonly LocalCatalogCandidate[],
  now: Date,
  options: { maxAgeMs?: number } = {},
): Estimate {
  if (new Set(candidates.map((c) => c.stationeryId)).size > 1) throw new RangeError("candidatos de mais de uma papelaria");
  const maxAge = options.maxAgeMs ?? DEFAULT_LOCAL_QUOTE_MAX_AGE_MS;
  const nowMs = now.getTime();
  const byKey = new Map<string, LocalCatalogCandidate[]>();
  for (const c of candidates) byKey.set(c.itemKey, [...(byKey.get(c.itemKey) ?? []), c]);

  const lines: EstimateLine[] = items.map((item) => {
    const rows = byKey.get(item.itemKey) ?? [];
    const active = rows.filter((c) => c.status === "active" && c.itemActive);
    const valid = active
      .filter((c) => {
        const t = c.priceUpdatedAt.getTime();
        return (
          c.stock !== "out_of_stock" &&
          Number.isSafeInteger(c.priceCents) &&
          c.priceCents > 0 &&
          c.priceCents <= MAX_PRICE_CENTS &&
          Number.isFinite(t) &&
          nowMs - t <= maxAge &&
          t - nowMs <= LOCAL_QUOTE_FUTURE_TOLERANCE_MS
        );
      })
      .sort((a, b) => b.priceUpdatedAt.getTime() - a.priceUpdatedAt.getTime())[0];
    const stock: CatalogStock = (valid ?? active[0])?.stock ?? "unknown";
    const total = valid ? mulCents(valid.priceCents, item.quantity) : null;
    if (!valid || total === null) {
      return { ...item, status: "unavailable", unitPriceCents: null, lineTotalCents: null, stock, stockLabel: stockLabel(stock), priceUpdatedAt: null };
    }
    return { ...item, status: "priced", unitPriceCents: valid.priceCents, lineTotalCents: total, stock, stockLabel: stockLabel(stock), priceUpdatedAt: valid.priceUpdatedAt };
  });

  const priced = lines.filter((l) => l.status === "priced");
  const subtotal = priced.length > 0 ? sumCents(priced.map((l) => l.lineTotalCents ?? 0)) : null;
  const overflow = priced.length > 0 && subtotal === null;
  const status: Estimate["status"] =
    priced.length === 0 || overflow ? "unavailable" : priced.length === lines.length ? "available" : "partial";
  const dates = priced.map((l) => l.priceUpdatedAt?.getTime() ?? Infinity);
  return {
    status,
    lines,
    subtotalCents: status === "unavailable" ? null : subtotal,
    pricedCount: priced.length,
    totalCount: lines.length,
    source: status === "unavailable" ? null : CATALOG_PRICE_SOURCE,
    asOf: status === "unavailable" ? null : new Date(Math.min(...dates)),
  };
}
