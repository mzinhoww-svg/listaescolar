import { describe, expect, it } from "vitest";

import {
  catalogItemKey,
  CatalogItemInputSchema,
  neutralizeFormula,
  parsePriceToCents,
  parseStockAnswer,
} from "@/features/stationeries/catalog";

describe("parsePriceToCents", () => {
  it.each([
    ["12,50", 1250],
    ["12.50", 1250],
    ["12", 1200],
    ["12,5", 1250],
    ["0,99", 99],
    ["1.234,50", 123450],
    ["1,234.50", 123450],
    ["R$ 12,50", 1250],
    [" 7,00 ", 700],
    ["1.234", null], // ambíguo
    ["999.999,99", 99999999],
    ["1.234.567", null], // acima do limite
    ["0", null],
    ["0,00", null],
    ["-5,00", null],
    ["12,5x", null],
    ["12,505", null],
    ["abc", null],
    ["", null],
    ["12,,50", null],
    ["1.2.3", null],
    ["1000000,01", null], // acima do limite
    ["12,505", null],
    ["99999999999999999999", null],
    ["1000000", 100000000],
  ])("%j -> %j", (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected);
  });
});

describe("nome de item (fórmula)", () => {
  it.each(["=CMD()", "+1", "-x", "@soma", " =A1"])("recusa %j", (name) => {
    expect(CatalogItemInputSchema.safeParse({ name, priceCents: 100 }).success).toBe(false);
  });
  it("aceita nome comum", () => {
    expect(CatalogItemInputSchema.safeParse({ name: "Lápis HB", priceCents: 100 }).success).toBe(true);
  });
});

describe("estoque e chave", () => {
  it.each([
    ["sim", "in_stock"],
    ["Sim", "in_stock"],
    ["não", "out_of_stock"],
    ["nao", "out_of_stock"],
    ["", "unknown"],
    ["talvez", null],
  ])("estoque %j -> %j", (i, e) => expect(parseStockAnswer(i)).toBe(e));

  it("item_key usa a normalização do carrinho", () => {
    expect(catalogItemKey("  Lápis   HB  ")).toBe("lapis hb");
    expect(catalogItemKey("CADERNO 96 folhas")).toBe("caderno 96 folhas");
  });
  it("neutraliza fórmulas", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("@x")).toBe("'@x");
    expect(neutralizeFormula("+1")).toBe("'+1");
    expect(neutralizeFormula("-1")).toBe("'-1");
    expect(neutralizeFormula("lápis")).toBe("lápis");
    expect(neutralizeFormula("  =1+1")).toBe("'  =1+1"); // espaços antes da fórmula não escondem
    expect(neutralizeFormula("\t@x")).toBe("'\t@x");
  });
  it("schema do item", () => {
    expect(CatalogItemInputSchema.safeParse({ name: "Lápis", priceCents: 0 }).success).toBe(false);
    expect(CatalogItemInputSchema.safeParse({ name: "Lápis", priceCents: 1.5 }).success).toBe(false);
    expect(CatalogItemInputSchema.safeParse({ name: "Lápis", priceCents: 100_000_001 }).success).toBe(false);
    expect(CatalogItemInputSchema.safeParse({ name: " ", priceCents: 100 }).success).toBe(false);
    expect(CatalogItemInputSchema.parse({ name: "Lápis", priceCents: 100 }).stock).toBe("unknown");
  });
});
