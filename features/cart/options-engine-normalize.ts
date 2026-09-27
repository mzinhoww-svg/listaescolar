import { isCents, isQuantity } from "./money";
import type { CartItemInput, LocalQuote, OptionLine, Quote } from "./types";

/**
 * Normalização de itens e ofertas, extraída de `options-engine.ts` (D-057, S18, arquivo com 445 linhas):
 * comportamento idêntico ao original, só a posição do código mudou.
 */

/** Tolerância de relógio: data de consulta no futuro além disso é inconfiável e o preço é excluído. */
export const FUTURE_SKEW_MS = 5 * 60 * 1000;

export type Offer = {
  storeId: string;
  itemKey: string;
  unitPriceCents: number;
  source: string;
  checkedAt: Date;
  url?: string;
  deliveryDays?: number;
  inStock?: boolean;
  isDemo?: boolean;
};
export type NormItem = { itemKey: string; name: string; quantity: number };

export function toOffer(q: Quote | LocalQuote): Offer {
  const storeId = "retailerSlug" in q ? q.retailerSlug : `local:${q.stationeryId}`;
  return {
    storeId,
    itemKey: q.itemKey,
    unitPriceCents: q.unitPriceCents,
    source: q.source,
    checkedAt: q.checkedAt,
    url: "url" in q ? q.url : undefined,
    deliveryDays: q.deliveryDays,
    inStock: q.inStock,
    isDemo: q.isDemo,
  };
}

function validOffer(o: Offer): boolean {
  return (
    o.storeId.trim() !== "" &&
    o.itemKey.trim() !== "" &&
    isCents(o.unitPriceCents) &&
    typeof o.source === "string" &&
    o.source.trim() !== "" &&
    o.checkedAt instanceof Date &&
    !Number.isNaN(o.checkedAt.getTime())
  );
}

export function normalizeItems(items: readonly CartItemInput[]): { valid: NormItem[]; invalid: string[] } {
  const byKey = new Map<string, NormItem>();
  const bad = new Set<string>();
  for (const item of items) {
    if (item.itemKey.trim() === "") continue;
    if (!isQuantity(item.quantity)) {
      bad.add(item.itemKey);
      continue;
    }
    const prev = byKey.get(item.itemKey);
    if (prev) prev.quantity += item.quantity;
    else
      byKey.set(item.itemKey, { itemKey: item.itemKey, name: item.name, quantity: item.quantity });
  }
  const valid: NormItem[] = [];
  for (const entry of byKey.values()) {
    if (Number.isSafeInteger(entry.quantity)) valid.push(entry);
    else bad.add(entry.itemKey); // soma fora do inteiro seguro: vai para os inválidos, não some
  }
  // Uma entrada inválida não anula outra válida da mesma chave (essa continua cotada).
  const invalid = [...bad].filter((k) => valid.every((v) => v.itemKey !== k));
  return { valid, invalid };
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpOffer(a: Offer, b: Offer): number {
  return (
    a.unitPriceCents - b.unitPriceCents ||
    b.checkedAt.getTime() - a.checkedAt.getTime() ||
    cmpText(a.source, b.source) ||
    Number(a.isDemo === true) - Number(b.isDemo === true) || // real antes de demo
    cmpText(a.url ?? "", b.url ?? "")
  );
}

/** Filtra por validade/frescor/estoque e guarda a melhor oferta por (loja, item). */
export function prepare(offers: Offer[], items: NormItem[], now: Date, staleAfterMs: number) {
  const wanted = new Set(items.map((i) => i.itemKey));
  const best = new Map<string, Offer>(); // storeId\u0000itemKey
  const staleKeys = new Map<string, { storeId: string; itemKey: string }>();
  for (const o of offers) {
    if (!validOffer(o) || !wanted.has(o.itemKey)) continue;
    const age = now.getTime() - o.checkedAt.getTime();
    if (age > staleAfterMs || age < -FUTURE_SKEW_MS) {
      staleKeys.set(`${o.storeId}\u0000${o.itemKey}`, { storeId: o.storeId, itemKey: o.itemKey });
      continue;
    }
    if (o.inStock === false) continue;
    const key = `${o.storeId}\u0000${o.itemKey}`;
    const prev = best.get(key);
    if (!prev || cmpOffer(o, prev) < 0) best.set(key, o);
  }
  // Pares estruturados: o separador só é aplicado na saída, então `local:<uuid>` não quebra a conferência.
  const staleExcluded = [...staleKeys.entries()]
    .filter(([key]) => !best.has(key))
    .map(([, pair]) => `${pair.storeId}:${pair.itemKey}`)
    .sort();
  const byStore = new Map<string, Map<string, Offer>>();
  for (const offer of best.values()) {
    const inner = byStore.get(offer.storeId) ?? new Map<string, Offer>();
    inner.set(offer.itemKey, offer);
    byStore.set(offer.storeId, inner);
  }
  return { byStore, staleExcluded };
}

export function emptyLine(item: NormItem): OptionLine {
  return {
    itemKey: item.itemKey,
    name: item.name,
    quantity: item.quantity,
    status: "unavailable",
    storeId: null,
    unitPriceCents: null,
    lineTotalCents: null,
    source: null,
    checkedAt: null,
  };
}
