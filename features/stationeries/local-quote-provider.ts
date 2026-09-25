import type { LocalStationeryQuoteProvider, ProviderOptions } from "@/features/cart/ports";
import type { CartItemInput, LocalQuote } from "@/features/cart/types";

import { CATALOG_PRICE_SOURCE, MAX_PRICE_CENTS } from "./catalog";
import type { LocalCatalogCandidate, LocalCatalogSource, LocalLocation } from "./ports";

export const DEFAULT_LOCAL_QUOTE_MAX_AGE_MS = 30 * 24 * 3_600_000; // 30 dias
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** A papelaria atende o local? (área cadastrada, ou o bairro/município da própria papelaria.) */
export function servesLocation(c: LocalCatalogCandidate, loc: LocalLocation): boolean {
  const hood = loc.neighborhood?.trim().toLowerCase();
  if (!hood) {
    return c.municipalityId === loc.municipalityId || c.areas.some((a) => a.municipalityId === loc.municipalityId);
  }
  if (c.areas.some((a) => a.municipalityId === loc.municipalityId && a.neighborhood.toLowerCase() === hood)) return true;
  return c.municipalityId === loc.municipalityId && (c.neighborhood?.trim().toLowerCase() ?? "") === hood;
}

/**
 * Cotação local a partir do catálogo informado pelas papelarias. Só entra papelaria `active` que atende o
 * local, item ativo, não `out_of_stock`, com preço válido e `price_updated_at` dentro da validade. Nunca completa
 * item sem catálogo. `source` e `checkedAt` (= `catalog_items.price_updated_at`) sempre presentes.
 */
export class CatalogLocalQuoteProvider implements LocalStationeryQuoteProvider {
  constructor(
    private readonly source: LocalCatalogSource,
    private readonly location: LocalLocation,
    private readonly settings: { maxAgeMs?: number } = {},
  ) {}

  async getQuotes(items: readonly CartItemInput[], options: ProviderOptions = {}): Promise<LocalQuote[]> {
    if (options.signal?.aborted) throw new DOMException("cancelado", "AbortError");
    const wanted = new Set(items.map((i) => i.itemKey));
    if (wanted.size === 0) return [];
    const now = (options.now ?? new Date()).getTime();
    const maxAge = this.settings.maxAgeMs ?? DEFAULT_LOCAL_QUOTE_MAX_AGE_MS;
    const candidates = await this.source.findCandidates(
      { itemKeys: [...wanted], location: this.location },
      options.signal ? { signal: options.signal } : undefined,
    );
    const quotes: LocalQuote[] = [];
    for (const c of candidates) {
      if (c.status !== "active" || !c.itemActive) continue;
      if (!wanted.has(c.itemKey)) continue;
      if (c.stock === "out_of_stock") continue;
      if (!servesLocation(c, this.location)) continue;
      if (!Number.isSafeInteger(c.priceCents) || c.priceCents <= 0 || c.priceCents > MAX_PRICE_CENTS) continue;
      const t = c.priceUpdatedAt.getTime();
      if (!Number.isFinite(t) || now - t > maxAge || t - now > FUTURE_TOLERANCE_MS) continue;
      quotes.push({
        stationeryId: c.stationeryId,
        itemKey: c.itemKey,
        unitPriceCents: c.priceCents,
        source: CATALOG_PRICE_SOURCE,
        checkedAt: c.priceUpdatedAt,
        ...(c.stock === "in_stock" ? { inStock: true } : {}),
        ...(c.isDemo ? { isDemo: true } : {}),
      });
    }
    return quotes;
  }
}
