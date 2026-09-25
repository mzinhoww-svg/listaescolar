import { describe, expect, it } from "vitest";

import { normalizeItemKey } from "@/features/cart/item-key";
import type { LocalStationeryQuoteProvider } from "@/features/cart/ports";
import type { CartItemInput } from "@/features/cart/types";
import { CatalogLocalQuoteProvider, servesLocation } from "@/features/stationeries/local-quote-provider";
import type { LocalCatalogCandidate, LocalCatalogSource } from "@/features/stationeries/ports";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 3_600_000);
const MUNI = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const item = (name: string, quantity = 1): CartItemInput => ({ itemKey: normalizeItemKey(name), name, quantity });

const cand = (over: Partial<LocalCatalogCandidate> = {}): LocalCatalogCandidate => ({
  stationeryId: "s1",
  status: "active",
  municipalityId: MUNI,
  neighborhood: "Centro",
  isDemo: false,
  areas: [{ municipalityId: MUNI, neighborhood: "jardim" }],
  itemKey: "caderno",
  priceCents: 1500,
  priceSource: "informed_by_stationery",
  stock: "in_stock",
  itemActive: true,
  priceUpdatedAt: day(1),
  ...over,
});
const source = (rows: LocalCatalogCandidate[]): LocalCatalogSource => ({ findCandidates: async () => rows });
const provider = (rows: LocalCatalogCandidate[], hood?: string, maxAgeMs?: number) =>
  new CatalogLocalQuoteProvider(source(rows), { municipalityId: MUNI, ...(hood ? { neighborhood: hood } : {}) }, maxAgeMs ? { maxAgeMs } : {});

describe("CatalogLocalQuoteProvider", () => {
  it("cotação válida com source e checkedAt (contrato LocalQuote da S12)", async () => {
    const p: LocalStationeryQuoteProvider = provider([cand()]);
    const [q] = await p.getQuotes([item("Caderno")], { now: NOW });
    expect(q).toEqual({
      stationeryId: "s1",
      itemKey: "caderno",
      unitPriceCents: 1500,
      source: "informed_by_stationery",
      checkedAt: day(1),
      inStock: true,
    });
  });
  it("source e checkedAt sempre presentes; estoque unknown não vira inStock; demo é marcado", async () => {
    const quotes = await provider([cand({ stock: "unknown", isDemo: true })]).getQuotes([item("Caderno")], { now: NOW });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.source).toBeTruthy();
    expect(quotes[0]?.checkedAt).toBeInstanceOf(Date);
    expect(quotes[0]).not.toHaveProperty("inStock");
    expect(quotes[0]?.isDemo).toBe(true);
    expect(quotes[0]).not.toHaveProperty("deliveryDays");
  });
  it.each([
    ["papelaria não ativa", cand({ status: "paused" })],
    ["suspensa", cand({ status: "suspended" })],
    ["em análise", cand({ status: "under_review" })],
    ["item inativo", cand({ itemActive: false })],
    ["out_of_stock", cand({ stock: "out_of_stock" })],
    ["price_updated_at velho (31 dias)", cand({ priceUpdatedAt: day(31) })],
    ["price_updated_at no futuro", cand({ priceUpdatedAt: new Date(NOW.getTime() + 3_600_000) })],
    ["data inválida", cand({ priceUpdatedAt: new Date("x") })],
    ["preço zero", cand({ priceCents: 0 })],
    ["preço negativo", cand({ priceCents: -1 })],
    ["preço fracionado", cand({ priceCents: 1.5 })],
    ["acima do limite", cand({ priceCents: 100_000_001 })],
    ["item que não foi pedido", cand({ itemKey: "outro" })],
    ["fora do município", cand({ municipalityId: OTHER, areas: [{ municipalityId: OTHER, neighborhood: "centro" }] })],
  ])("omite: %s", async (_n, row) => {
    expect(await provider([row]).getQuotes([item("Caderno")], { now: NOW })).toEqual([]);
  });
  it("validade configurável e 30 dias inclusivos", async () => {
    expect(await provider([cand({ priceUpdatedAt: day(30) })]).getQuotes([item("Caderno")], { now: NOW })).toHaveLength(1);
    expect(await provider([cand({ priceUpdatedAt: day(2) })], undefined, 24 * 3_600_000).getQuotes([item("Caderno")], { now: NOW })).toEqual([]);
  });
  it("fora da área: bairro atendido (área ou bairro da papelaria) x não atendido", async () => {
    expect(await provider([cand()], "Jardim").getQuotes([item("Caderno")], { now: NOW })).toHaveLength(1);
    expect(await provider([cand()], "centro").getQuotes([item("Caderno")], { now: NOW })).toHaveLength(1);
    expect(await provider([cand()], "Coxipó").getQuotes([item("Caderno")], { now: NOW })).toEqual([]);
  });
  it("sem catálogo ou sem itens: nada (nunca inventa)", async () => {
    expect(await provider([]).getQuotes([item("Caderno")], { now: NOW })).toEqual([]);
    expect(await provider([cand()]).getQuotes([], { now: NOW })).toEqual([]);
  });
  it("item sem catálogo em uma papelaria não é preenchido", async () => {
    const quotes = await provider([cand()]).getQuotes([item("Caderno"), item("Tesoura")], { now: NOW });
    expect(quotes.map((q) => q.itemKey)).toEqual(["caderno"]);
  });
  it("várias papelarias: devolve todas as cotações válidas", async () => {
    const quotes = await provider([cand(), cand({ stationeryId: "s2", priceCents: 1400 }), cand({ stationeryId: "s3", status: "paused" })]).getQuotes(
      [item("Caderno")],
      { now: NOW },
    );
    expect(quotes.map((q) => q.stationeryId)).toEqual(["s1", "s2"]);
  });
  it("cancelamento", async () => {
    const c = new AbortController();
    c.abort();
    await expect(provider([cand()]).getQuotes([item("Caderno")], { now: NOW, signal: c.signal })).rejects.toThrow();
  });
});

describe("servesLocation", () => {
  it("sem bairro: qualquer papelaria do município", () => {
    expect(servesLocation(cand(), { municipalityId: MUNI })).toBe(true);
    expect(servesLocation(cand(), { municipalityId: OTHER })).toBe(false);
  });
});
