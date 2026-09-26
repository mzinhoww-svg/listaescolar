import { describe, expect, it } from "vitest";

import { matchItems, type MatchableItem, type MatchSku } from "@/features/b2b/api/match";

const item = (over: Partial<MatchableItem> = {}): MatchableItem => ({ position: 1, name: "Caderno 96 folhas", quantity: 2, unit: "un", ...over });
const sku = (over: Partial<MatchSku> = {}): MatchSku => ({ sku: "SKU-1", name: "Caderno 96 folhas", ...over });

describe("matchItems", () => {
  it("casamento exato (mesmo normalizeItemKey)", () => {
    const result = matchItems([item()], [sku({ sku: "AAA", name: "Caderno 96 Folhas" })]);
    expect(result.items[0]!.match).toEqual({ sku: "AAA", method: "exact" });
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
  });

  it("casamento por tokens quando não há exato", () => {
    const result = matchItems(
      [item({ name: "Caderno brochura 96 folhas" })],
      [sku({ sku: "BBB", name: "Caderno 96 folhas brochura capa dura" })],
    );
    expect(result.items[0]!.match).toEqual({ sku: "BBB", method: "tokens" });
  });

  it("conectivos não entram na comparação de tokens", () => {
    const result = matchItems(
      [item({ name: "Caneta para desenho" })],
      [sku({ sku: "CCC", name: "Caneta de desenho profissional" })],
    );
    expect(result.items[0]!.match).toEqual({ sku: "CCC", method: "tokens" });
  });

  it("empate determinístico: menor nome normalizado primeiro", () => {
    const skus = [sku({ sku: "Z1", name: "Caderno 96 folhas azul" }), sku({ sku: "A1", name: "Caderno 96 folhas amarelo" })];
    const result = matchItems([item({ name: "caderno 96 folhas" })], skus);
    // nenhum é exato (o item não tem cor); ambos batem por tokens (caderno, folhas presentes nos dois — 96 é numérico com 2 chars, também token)
    expect(result.items[0]!.match?.method).toBe("tokens");
    expect(result.items[0]!.match?.sku).toBe("A1"); // "caderno 96 folhas amarelo" < "caderno 96 folhas azul"
  });

  it("empate final por ordem de entrada quando o nome normalizado é idêntico", () => {
    const skus = [sku({ sku: "FIRST", name: "Caderno 96 folhas" }), sku({ sku: "SECOND", name: "Caderno 96 folhas" })];
    const result = matchItems([item()], skus);
    expect(result.items[0]!.match).toEqual({ sku: "FIRST", method: "exact" });
  });

  it("acentos e caixa não importam", () => {
    const result = matchItems([item({ name: "Lápis de Côr" })], [sku({ sku: "LAPIS", name: "LAPIS DE COR" })]);
    expect(result.items[0]!.match).toEqual({ sku: "LAPIS", method: "exact" });
  });

  it("nenhum SKU -> tudo sem match, sem lançar", () => {
    const result = matchItems([item(), item({ position: 2, name: "Lápis HB" })], []);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(2);
    expect(result.items.every((i) => i.match === null)).toBe(true);
  });

  it("SKU sem nenhum token significativo em comum não casa", () => {
    const result = matchItems([item({ name: "Estojo escolar" })], [sku({ sku: "X", name: "Mochila de rodinhas" })]);
    expect(result.items[0]!.match).toBeNull();
  });

  it("não ecoa SKU que não casou com nenhum item", () => {
    const result = matchItems([item()], [sku({ sku: "USED", name: "Caderno 96 folhas" }), sku({ sku: "UNUSED", name: "Giz de cera" })]);
    const skusInResponse = result.items.map((i) => i.match?.sku).filter(Boolean);
    expect(skusInResponse).toEqual(["USED"]);
    expect(JSON.stringify(result)).not.toContain("UNUSED");
  });

  it("5000 SKUs resolvem em menos de 200ms", () => {
    const skus: MatchSku[] = Array.from({ length: 5000 }, (_, i) => sku({ sku: `SKU-${i}`, name: `Produto genérico número ${i}` }));
    const items: MatchableItem[] = [item({ name: "Produto genérico número 2500" }), item({ position: 2, name: "Caderno 96 folhas" })];
    const start = performance.now();
    const result = matchItems(items, skus);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(result.items[0]!.match?.sku).toBe("SKU-2500");
    expect(result.items[1]!.match).toBeNull();
  });

  it("é puro e determinístico (mesma entrada, mesma saída)", () => {
    const items = [item()];
    const skus = [sku()];
    expect(matchItems(items, skus)).toEqual(matchItems(items, skus));
  });
});
