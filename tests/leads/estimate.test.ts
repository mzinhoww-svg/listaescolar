import { describe, expect, it } from "vitest";

import { estimateFromCatalog } from "@/features/leads/estimate";
import type { LocalCatalogCandidate } from "@/features/stationeries/ports";

const NOW = new Date("2026-09-25T12:00:00Z");
const DAY = 24 * 3_600_000;
const STAT = "44444444-4444-4444-8444-444444444444";

const cand = (over: Partial<LocalCatalogCandidate>): LocalCatalogCandidate => ({
  stationeryId: STAT,
  status: "active",
  municipalityId: "m",
  neighborhood: "centro",
  isDemo: false,
  areas: [],
  itemKey: "caderno",
  priceCents: 1000,
  priceSource: "informed_by_stationery",
  stock: "unknown",
  itemActive: true,
  priceUpdatedAt: new Date(NOW.getTime() - 2 * DAY),
  ...over,
});
const items = [
  { itemKey: "caderno", name: "Caderno", quantity: 3 },
  { itemKey: "lapis", name: "Lápis", quantity: 12 },
  { itemKey: "cola", name: "Cola", quantity: 1 },
];

describe("estimateFromCatalog", () => {
  it("soma em centavos inteiros só o que tem catálogo válido", () => {
    const e = estimateFromCatalog(items, [cand({}), cand({ itemKey: "lapis", priceCents: 199 })], NOW);
    expect(e.subtotalCents).toBe(3 * 1000 + 12 * 199);
    expect(e.pricedCount).toBe(2);
    expect(e.totalCount).toBe(3);
    expect(e.status).toBe("partial");
    expect(e.source).toBe("informed_by_stationery");
    expect(e.lines.find((l) => l.itemKey === "cola")).toMatchObject({ status: "unavailable", unitPriceCents: null, lineTotalCents: null });
  });

  it("cobertura total vira available; nenhuma vira unavailable sem subtotal e sem origem", () => {
    const all = estimateFromCatalog(
      items,
      [cand({}), cand({ itemKey: "lapis" }), cand({ itemKey: "cola" })],
      NOW,
    );
    expect(all.status).toBe("available");
    const none = estimateFromCatalog(items, [], NOW);
    expect(none).toMatchObject({ status: "unavailable", subtotalCents: null, source: null, asOf: null, pricedCount: 0 });
  });

  it("preço velho (mais de 30 dias) não entra", () => {
    const e = estimateFromCatalog([items[0]!], [cand({ priceUpdatedAt: new Date(NOW.getTime() - 31 * DAY) })], NOW);
    expect(e.status).toBe("unavailable");
    const edge = estimateFromCatalog([items[0]!], [cand({ priceUpdatedAt: new Date(NOW.getTime() - 30 * DAY) })], NOW);
    expect(edge.status).toBe("available");
  });

  it("data no futuro, preço inválido e item inativo não entram", () => {
    for (const over of [
      { priceUpdatedAt: new Date(NOW.getTime() + DAY) },
      { priceCents: 0 },
      { priceCents: -5 },
      { priceCents: 1.5 },
      { priceCents: 100_000_001 },
      { itemActive: false },
      { priceUpdatedAt: new Date("invalid") },
    ]) {
      expect(estimateFromCatalog([items[0]!], [cand(over)], NOW).status).toBe("unavailable");
    }
  });

  it("out_of_stock não entra no preço mas aparece 'Em falta'; estoque só quando informado", () => {
    const e = estimateFromCatalog(items, [cand({ stock: "out_of_stock" }), cand({ itemKey: "lapis", stock: "in_stock" }), cand({ itemKey: "cola" })], NOW);
    const by = (k: string) => e.lines.find((l) => l.itemKey === k)!;
    expect(by("caderno")).toMatchObject({ status: "unavailable", stockLabel: "Em falta" });
    expect(by("lapis")).toMatchObject({ status: "priced", stockLabel: "Tenho" });
    expect(by("cola")).toMatchObject({ status: "priced", stockLabel: "não informado" });
    expect(e.subtotalCents).toBe(12 * 1000 + 1000);
  });

  it("item sem catálogo é indisponível e não é completado", () => {
    const e = estimateFromCatalog(items, [cand({ itemKey: "outra coisa" })], NOW);
    expect(e.pricedCount).toBe(0);
    expect(e.lines.every((l) => l.stockLabel === "não informado")).toBe(true);
  });

  it("papelaria que não está active não estima", () => {
    expect(estimateFromCatalog([items[0]!], [cand({ status: "paused" })], NOW).status).toBe("unavailable");
  });

  it("asOf é a data mais antiga entre os preços usados", () => {
    const old = new Date(NOW.getTime() - 10 * DAY);
    const e = estimateFromCatalog(items, [cand({}), cand({ itemKey: "lapis", priceUpdatedAt: old })], NOW);
    expect(e.asOf?.getTime()).toBe(old.getTime());
  });

  it("linha repetida do mesmo item usa o preço válido mais recente", () => {
    const e = estimateFromCatalog(
      [items[0]!],
      [cand({ priceCents: 500, priceUpdatedAt: new Date(NOW.getTime() - 5 * DAY) }), cand({ priceCents: 700, priceUpdatedAt: new Date(NOW.getTime() - 1 * DAY) })],
      NOW,
    );
    expect(e.subtotalCents).toBe(3 * 700);
  });

  it("estouro de soma vira subtotal nulo, nunca valor errado", () => {
    const big = [{ itemKey: "a", name: "A", quantity: Number.MAX_SAFE_INTEGER }];
    const e = estimateFromCatalog(big, [cand({ itemKey: "a", priceCents: 2 })], NOW);
    expect(e.subtotalCents).toBeNull();
    expect(e.status).not.toBe("available");
  });

  it("candidatos de mais de uma papelaria são recusados", () => {
    expect(() => estimateFromCatalog(items, [cand({}), cand({ stationeryId: "outra" })], NOW)).toThrow();
  });
});
