import { describe, expect, it } from "vitest";

import { buildCartOptions } from "@/features/cart/options-engine";
import type { CartItemInput, CartOption, LocalQuote, Quote } from "@/features/cart/types";

import { hoursAgo, item, NOW } from "./helpers";

// PRNG determinístico (mulberry32) para propriedades reproduzíveis.
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scenario(seed: number) {
  const r = rng(seed);
  const int = (n: number) => Math.floor(r() * n);
  const items: CartItemInput[] = Array.from({ length: int(6) }, (_, i) =>
    item(`Item ${i}`, 1 + int(20)),
  );
  const slugs = ["a", "b", "c", "d", "e"].slice(0, 1 + int(5));
  const quotes: Quote[] = [];
  const local: LocalQuote[] = [];
  for (const it of items) {
    for (const slug of slugs) {
      if (r() < 0.35) continue;
      const roll = r();
      quotes.push({
        retailerSlug: slug,
        itemKey: it.itemKey,
        unitPriceCents: roll < 0.05 ? 12.5 : roll < 0.08 ? 0 : 100 + int(9000),
        source: roll > 0.95 ? "" : "fixture_teste",
        checkedAt:
          roll > 0.9 && roll <= 0.95 ? new Date("invalid") : hoursAgo(r() < 0.2 ? 30 : int(23)),
        deliveryDays: r() < 0.5 ? int(10) : undefined,
        inStock: r() < 0.1 ? false : undefined,
      });
    }
    if (r() < 0.4)
      local.push({
        stationeryId: "loc",
        itemKey: it.itemKey,
        unitPriceCents: 100 + int(9000),
        source: "fixture_teste_local",
        checkedAt: hoursAgo(int(20)),
      });
  }
  return { items, quotes, local: r() < 0.5 ? local : null };
}

function checkOption(o: CartOption, items: CartItemInput[]): void {
  const priced = o.lines.filter((l) => l.status === "priced");
  // Nenhum valor monetário sem source + checkedAt.
  for (const l of priced) {
    expect(typeof l.source === "string" && l.source.trim() !== "").toBe(true);
    expect(l.checkedAt instanceof Date && !Number.isNaN(l.checkedAt.getTime())).toBe(true);
    expect(Number.isSafeInteger(l.unitPriceCents) && (l.unitPriceCents ?? 0) > 0).toBe(true);
    expect(l.lineTotalCents).toBe((l.unitPriceCents ?? 0) * l.quantity);
  }
  for (const l of o.lines.filter((x) => x.status === "unavailable")) {
    expect([l.unitPriceCents, l.lineTotalCents, l.source, l.checkedAt, l.storeId]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  }
  if (o.totalCents === null) {
    expect(o.status).toBe("unavailable");
    expect(priced).toHaveLength(0);
  } else {
    expect(Number.isSafeInteger(o.totalCents)).toBe(true);
    expect(o.totalCents).toBe(priced.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0));
    expect(o.status).toBe(o.missingItems.length === 0 ? "available" : "partial");
    expect(o.stores.length).toBeGreaterThan(0);
  }
  // Cobertura: cada item ou está precificado ou em missingItems.
  const keys = new Set(items.map((i) => i.itemKey));
  expect(new Set([...priced.map((l) => l.itemKey), ...o.missingItems])).toEqual(keys);
}

describe("propriedades do motor (300 cenários aleatórios reproduzíveis)", () => {
  it("nunca há total sem source+checkedAt; totais somam as linhas; 4 opções; determinismo", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { items, quotes, local } = scenario(seed);
      const opts = buildCartOptions(items, quotes, local, NOW);
      expect(opts.map((o) => o.strategy)).toEqual([
        "cheapest",
        "fewest_stores",
        "balanced",
        "local_stationery",
      ]);
      if (items.length === 0) continue;
      for (const o of opts) checkOption(o, items);
      // Determinismo e independência da ordem das cotações.
      const shuffled = [...quotes].reverse();
      expect(JSON.stringify(buildCartOptions(items, shuffled, local, NOW))).toBe(
        JSON.stringify(opts),
      );
    }
  });

  it("cheapest nunca custa mais que fewest_stores/balanced quando todos cobrem os mesmos itens", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { items, quotes } = scenario(seed);
      if (items.length === 0) continue;
      const [cheapest, fewest, balanced] = buildCartOptions(items, quotes, null, NOW);
      if (
        cheapest?.totalCents == null ||
        fewest?.totalCents == null ||
        balanced?.totalCents == null
      )
        continue;
      expect(cheapest.totalCents).toBeLessThanOrEqual(fewest.totalCents);
      expect(cheapest.totalCents).toBeLessThanOrEqual(balanced.totalCents);
      expect(fewest.stores.length).toBeLessThanOrEqual(balanced.stores.length);
      expect(fewest.stores.length).toBeLessThanOrEqual(cheapest.stores.length);
    }
  });
});
