import { describe, expect, it } from "vitest";

import { ALERT_CODES, itemInputSchema, itemsInputSchema, normalizeItemName } from "@/features/lists/schemas";

const base = { originalName: "Caderno 96 folhas", quantity: 2 };

describe("itemInputSchema", () => {
  it("aceita item mínimo e deriva o nome normalizado", () => {
    const r = itemInputSchema.parse(base);
    expect(r.normalizedName).toBe("caderno 96 folhas");
    expect(r.alerts).toEqual([]);
    expect(r.category).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it("aceita item completo", () => {
    const r = itemInputSchema.parse({
      originalName: "Lápis de cor 12 cores",
      normalizedName: "lapis de cor 12 cores",
      category: "papelaria",
      quantity: 1,
      unit: "cx",
      confidence: 0.87,
      alerts: ["ambiguous_item", "handwritten"],
    });
    expect(r.alerts).toEqual(["ambiguous_item", "handwritten"]);
  });

  it("aceita quantidade textual com vírgula decimal e sem quantidade", () => {
    expect(itemInputSchema.parse({ ...base, quantity: "12,5" }).quantity).toBe(12.5);
    expect(itemInputSchema.parse({ ...base, quantity: "3" }).quantity).toBe(3);
    expect(itemInputSchema.parse({ originalName: "Régua" }).quantity).toBeNull();
  });

  it.each([
    ["zero", 0],
    ["negativa", -1],
    ["12,5x", "12,5x"],
    ["texto", "abc"],
    ["vazia", ""],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["3 casas", "1,234"],
    ["grande demais", 1e9],
  ])("rejeita quantidade %s", (_n, quantity) => {
    expect(itemInputSchema.safeParse({ ...base, quantity }).success).toBe(false);
  });

  it.each([
    ["código desconhecido", ["nao_existe"]],
    ["não é lista", "low_confidence_item"],
    ["mais de 20", Array.from({ length: 21 }, () => "handwritten")],
  ])("rejeita alerts: %s", (_n, alerts) => {
    expect(itemInputSchema.safeParse({ ...base, alerts }).success).toBe(false);
  });

  it.each([1.01, -0.1, 2])("rejeita confidence %s", (confidence) => {
    expect(itemInputSchema.safeParse({ ...base, confidence }).success).toBe(false);
  });

  it("aceita confidence nos limites", () => {
    expect(itemInputSchema.safeParse({ ...base, confidence: 0 }).success).toBe(true);
    expect(itemInputSchema.safeParse({ ...base, confidence: 1 }).success).toBe(true);
  });

  it("rejeita nome vazio ou longo demais", () => {
    expect(itemInputSchema.safeParse({ ...base, originalName: "   " }).success).toBe(false);
    expect(itemInputSchema.safeParse({ ...base, originalName: "x".repeat(501) }).success).toBe(false);
  });

  it("os sete códigos do spec §6 estão no enum", () => {
    expect([...ALERT_CODES].sort()).toEqual(
      [
        "ambiguous_item",
        "handwritten",
        "invalid_school_grade_year",
        "low_confidence_item",
        "possible_collective_item",
        "restrictive_brand_or_spec",
        "text_document_mismatch",
      ].sort(),
    );
  });

  it("itemsInputSchema exige ao menos um item", () => {
    expect(itemsInputSchema.safeParse([]).success).toBe(false);
    expect(itemsInputSchema.safeParse([base]).success).toBe(true);
  });
});

describe("normalizeItemName", () => {
  it.each([
    ["  Caderno  Brochura  ", "caderno brochura"],
    ["Lápis nº 2 (HB)", "lapis n 2 hb"],
    ["Tesoura s/ ponta", "tesoura s ponta"],
  ])("%s", (input, out) => {
    expect(normalizeItemName(input)).toBe(out);
  });
});
