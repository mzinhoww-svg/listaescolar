import { normalizeItemKey } from "@/features/cart/item-key";

// Casamento determinístico de SKUs do parceiro com os itens de uma lista pública (S24, `POST /v1/carts/match`).
// Sem IA: chave exata (`normalizeItemKey`, mesma normalização da S12) e, sem exata, conjunto de tokens
// significativos (>= 2 caracteres, fora dos conectivos) presentes no nome do SKU. Empate: menor nome do SKU
// (ordem lexicográfica do nome normalizado), depois ordem de entrada. Nunca ecoa SKU que não casou.

const CONNECTIVES = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "para", "em", "no", "na", "nos", "nas",
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "ou", "por", "sem", "ao", "aos", "à", "às",
]);

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length >= 2 && !CONNECTIVES.has(t));
}

export type MatchSku = { sku: string; name: string };
export type MatchableItem = { position: number; name: string; quantity: number | null; unit: string | null };
export type MatchMethod = "exact" | "tokens";
export type MatchedItem = {
  position: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  match: { sku: string; method: MatchMethod } | null;
};
export type MatchResult = { matched: number; unmatched: number; items: MatchedItem[] };

type PreparedSku = { index: number; sku: string; normalizedName: string; tokens: Set<string> };

function prepareSkus(skus: readonly MatchSku[]): PreparedSku[] {
  return skus.map((s, index) => {
    const normalizedName = normalizeItemKey(s.name);
    return { index, sku: s.sku, normalizedName, tokens: new Set(significantTokens(normalizedName)) };
  });
}

/** Menor nome normalizado; empate final pela ordem de entrada (índice menor). */
function pickBest(candidates: readonly PreparedSku[]): PreparedSku | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (c.normalizedName < best.normalizedName || (c.normalizedName === best.normalizedName && c.index < best.index)) {
      best = c;
    }
  }
  return best;
}

export function matchItems(listItems: readonly MatchableItem[], skus: readonly MatchSku[]): MatchResult {
  const prepared = prepareSkus(skus);
  const items: MatchedItem[] = listItems.map((item) => {
    const normalizedItem = normalizeItemKey(item.name);
    const itemTokens = significantTokens(normalizedItem);

    const exactCandidates = prepared.filter((p) => p.normalizedName === normalizedItem);
    const exact = pickBest(exactCandidates);
    let match: { sku: string; method: MatchMethod } | null = null;
    if (exact) {
      match = { sku: exact.sku, method: "exact" };
    } else if (itemTokens.length > 0) {
      const tokenCandidates = prepared.filter((p) => itemTokens.every((t) => p.tokens.has(t)));
      const best = pickBest(tokenCandidates);
      if (best) match = { sku: best.sku, method: "tokens" };
    }
    return { position: item.position, name: item.name, quantity: item.quantity, unit: item.unit, match };
  });
  const matched = items.filter((i) => i.match !== null).length;
  return { matched, unmatched: items.length - matched, items };
}
