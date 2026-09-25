import type { CartItemInput, LocalQuote, Quote } from "./types";

export type ProviderOptions = { signal?: AbortSignal; now?: Date };

/** Fonte de preços de varejistas. Só devolve preços com origem e data. */
export interface RetailerProvider {
  getQuotes(items: readonly CartItemInput[], options?: ProviderOptions): Promise<Quote[]>;
}

/** Cotação da papelaria local (implementada em S13/S14; ligada na S11). */
export interface LocalStationeryQuoteProvider {
  getQuotes(items: readonly CartItemInput[], options?: ProviderOptions): Promise<LocalQuote[]>;
}

export type ListItem = { id: string; name: string; quantity: number };

/** Leitura de listas (dono: outra trilha). `null` = lista inexistente ou sem acesso. */
export interface ListReader {
  getItems(listId: string, options?: ProviderOptions): Promise<ListItem[] | null>;
}
