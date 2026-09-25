/** Nome normalizado do item (chave de comparação em price_snapshots.item_key). */
export function normalizeItemKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
