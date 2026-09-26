import { describe, expect, it } from "vitest";

import { tierFor, validateTiers, type PriceTier } from "@/features/billing/tiers";

const TIERS: PriceTier[] = [
  { minItems: 1, maxItems: 20, priceCents: 500 },
  { minItems: 21, maxItems: null, priceCents: 900 },
];

describe("tierFor", () => {
  it("acha a faixa nas bordas", () => {
    expect(tierFor(TIERS, 1)?.priceCents).toBe(500);
    expect(tierFor(TIERS, 20)?.priceCents).toBe(500);
    expect(tierFor(TIERS, 21)?.priceCents).toBe(900);
    expect(tierFor(TIERS, 300)?.priceCents).toBe(900);
  });
  it("null fora da cobertura", () => {
    expect(tierFor(TIERS, 0)).toBeNull();
  });
});

describe("validateTiers", () => {
  it("aceita faixas contíguas cobrindo 1..N com a última aberta", () => {
    expect(validateTiers(TIERS)).toEqual({ ok: true });
    expect(validateTiers([{ minItems: 1, maxItems: null, priceCents: 100 }])).toEqual({ ok: true });
  });

  it("recusa vazio", () => {
    expect(validateTiers([])).toEqual({ ok: false, reason: "empty" });
  });

  it("recusa não começar em 1", () => {
    expect(validateTiers([{ minItems: 2, maxItems: null, priceCents: 100 }])).toEqual({ ok: false, reason: "not_starting_at_one" });
  });

  it("recusa buraco", () => {
    expect(
      validateTiers([
        { minItems: 1, maxItems: 10, priceCents: 100 },
        { minItems: 12, maxItems: null, priceCents: 200 },
      ]),
    ).toEqual({ ok: false, reason: "gap_or_overlap" });
  });

  it("recusa sobreposição", () => {
    expect(
      validateTiers([
        { minItems: 1, maxItems: 10, priceCents: 100 },
        { minItems: 9, maxItems: null, priceCents: 200 },
      ]),
    ).toEqual({ ok: false, reason: "gap_or_overlap" });
  });

  it("recusa faixa aberta antes da última", () => {
    expect(
      validateTiers([
        { minItems: 1, maxItems: null, priceCents: 100 },
        { minItems: 11, maxItems: null, priceCents: 200 },
      ]),
    ).toEqual({ ok: false, reason: "open_before_last" });
  });

  it("recusa última faixa fechada (sem faixa aberta)", () => {
    expect(validateTiers([{ minItems: 1, maxItems: 300, priceCents: 100 }])).toEqual({ ok: false, reason: "last_not_open" });
  });

  it("recusa max_items < min_items", () => {
    expect(validateTiers([{ minItems: 5, maxItems: 3, priceCents: 100 }])).toEqual({ ok: false, reason: "max_before_min" });
  });

  it("recusa preço fora de [1, 10_000_000]", () => {
    expect(validateTiers([{ minItems: 1, maxItems: null, priceCents: 0 }])).toEqual({ ok: false, reason: "price_out_of_range" });
    expect(validateTiers([{ minItems: 1, maxItems: null, priceCents: 10_000_001 }])).toEqual({ ok: false, reason: "price_out_of_range" });
  });

  it("ordena antes de validar (entrada fora de ordem)", () => {
    expect(
      validateTiers([
        { minItems: 21, maxItems: null, priceCents: 900 },
        { minItems: 1, maxItems: 20, priceCents: 500 },
      ]),
    ).toEqual({ ok: true });
  });
});
