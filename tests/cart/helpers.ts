import { normalizeItemKey } from "@/features/cart/item-key";
import type { CartItemInput, LocalQuote, Quote } from "@/features/cart/types";

// Todos os dados deste diretório são FIXTURES DE TESTE sintéticas; não representam preço real.
export const NOW = new Date("2026-09-24T12:00:00.000Z");
export const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);

export const item = (name: string, quantity: number): CartItemInput => ({
  itemKey: normalizeItemKey(name),
  name,
  quantity,
});
export const CADERNO = item("Caderno 96 folhas", 2);
export const LAPIS = item("Lápis HB", 3);
export const COLA = item("Cola branca", 1);

export const q = (
  retailerSlug: string,
  i: CartItemInput,
  unitPriceCents: number,
  extra: Partial<Quote> = {},
): Quote => ({
  retailerSlug,
  itemKey: i.itemKey,
  unitPriceCents,
  source: "fixture_teste",
  checkedAt: hoursAgo(1),
  ...extra,
});

export const lq = (
  stationeryId: string,
  i: CartItemInput,
  unitPriceCents: number,
  extra: Partial<LocalQuote> = {},
): LocalQuote => ({
  stationeryId,
  itemKey: i.itemKey,
  unitPriceCents,
  source: "fixture_teste_local",
  checkedAt: hoursAgo(1),
  ...extra,
});

/** Dataset A: kalunga cobre tudo; amazon+magalu é a combinação mais barata. */
export const datasetA = (kalungaCaderno: number): Quote[] => [
  q("kalunga", CADERNO, kalungaCaderno),
  q("kalunga", LAPIS, 200),
  q("kalunga", COLA, 300),
  q("magalu", CADERNO, 900),
  q("magalu", LAPIS, 250),
  q("amazon", COLA, 250),
  q("amazon", LAPIS, 150),
];
