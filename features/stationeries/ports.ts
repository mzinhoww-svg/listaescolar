import type { CatalogStock } from "./catalog";

export type LocalLocation = { municipalityId: string; neighborhood?: string };

/** Uma linha de catálogo com os dados da papelaria necessários para decidir se ela entra na cotação. */
export type LocalCatalogCandidate = {
  stationeryId: string;
  status: string;
  municipalityId: string;
  neighborhood: string | null;
  isDemo: boolean;
  areas: { municipalityId: string; neighborhood: string }[];
  itemKey: string;
  priceCents: number;
  priceSource: string;
  stock: CatalogStock;
  itemActive: boolean;
  /** `catalog_items.price_updated_at`: data do preço informado (não muda com estoque ou nome). */
  priceUpdatedAt: Date;
};

/** Fonte de dados do provedor local (implementada pelo repositório). */
export interface LocalCatalogSource {
  findCandidates(
    query: { itemKeys: readonly string[]; location: LocalLocation },
    options?: { signal?: AbortSignal },
  ): Promise<LocalCatalogCandidate[]>;
}
