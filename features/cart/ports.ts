import type { SessionActor } from "@/features/auth/actor";

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

/** Origem da lista lida: versão oficial publicada, cópia privada do pai ou demonstração (S11: gravada em `carts.list_kind`). */
export type ListKind = "official" | "parent_copy" | "demo";
export type ListSnapshot = { items: ListItem[]; kind: ListKind; isDemo: boolean };
export type ListReadOptions = ProviderOptions & {
  /** Ator da sessão: só ele enxerga a própria cópia do pai (cópia alheia = mesma resposta de inexistente). */
  actor?: SessionActor | null;
};

/** Leitura de listas (dono: outra trilha). `null` = lista inexistente ou sem acesso. */
export interface ListReader {
  getItems(listId: string, options?: ListReadOptions): Promise<ListItem[] | null>;
  /** Aditivo (S11): itens + origem + `isDemo`. */
  getList(listId: string, options?: ListReadOptions): Promise<ListSnapshot | null>;
}
