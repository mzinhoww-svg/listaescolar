import type { ProviderOptions, RetailerProvider } from "./ports";
import { snapshotRowSchema, type SnapshotRow } from "./schemas";
import type { CartItemInput, Quote } from "./types";

export type SnapshotFetcher = (itemKeys: string[], options?: ProviderOptions) => Promise<unknown[]>;

/**
 * Lê `price_snapshots` (origem e data sempre presentes). Linhas inválidas são descartadas; linhas de
 * demonstração só passam com `includeDemo`. O frescor (24 h) é aplicado pelo motor, que informa
 * `staleExcluded`.
 */
export class SnapshotRetailerProvider implements RetailerProvider {
  constructor(
    private readonly fetchRows: SnapshotFetcher,
    private readonly settings: { includeDemo?: boolean } = {},
  ) {}

  async getQuotes(items: readonly CartItemInput[], options?: ProviderOptions): Promise<Quote[]> {
    const keys = [...new Set(items.map((i) => i.itemKey))];
    if (keys.length === 0) return [];
    const raw = await this.fetchRows(keys, options);
    const quotes: Quote[] = [];
    for (const row of raw) {
      const parsed = snapshotRowSchema.safeParse(row);
      if (!parsed.success) continue;
      const r: SnapshotRow = parsed.data;
      if (r.isDemo && !this.settings.includeDemo) continue;
      quotes.push({
        retailerSlug: r.retailerSlug,
        itemKey: r.itemKey,
        unitPriceCents: r.priceCents,
        source: r.source,
        checkedAt: r.checkedAt,
        url: r.productUrl ?? undefined,
        isDemo: r.isDemo,
      });
    }
    return quotes;
  }
}
