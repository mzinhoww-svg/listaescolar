import { describe, expect, it } from "vitest";

import { formatBrl, parseBrlToCents } from "@/features/billing/money";
import { BILLING_MAX_AMOUNT_CENTS } from "@/features/billing/limits";

describe("parseBrlToCents", () => {
  it.each([
    ["12,50", 1250],
    ["12.50", 1250],
    ["1.234,50", 123450],
    ["R$ 12,50", 1250],
    ["12", 1200],
    ["0,01", 1],
  ])("aceita %s -> %i", (input, expected) => {
    expect(parseBrlToCents(input)).toBe(expected);
  });

  it.each([["0"], ["0,00"], ["-1"], ["-12,50"], ["12,5x"], ["abc"], [""], ["1.234"]])("recusa %s", (input) => {
    expect(parseBrlToCents(input)).toBeNull();
  });

  it("recusa acima do teto da cobrança", () => {
    const overCents = BILLING_MAX_AMOUNT_CENTS + 1;
    const text = (overCents / 100).toFixed(2).replace(".", ",");
    expect(parseBrlToCents(text)).toBeNull();
  });

  it("recusa valor não-string", () => {
    expect(parseBrlToCents(1250)).toBeNull();
    expect(parseBrlToCents(null)).toBeNull();
    expect(parseBrlToCents(undefined)).toBeNull();
  });
});

describe("formatBrl", () => {
  it("formata centavos em pt-BR", () => {
    expect(formatBrl(123450)).toBe("R$ 1.234,50");
    expect(formatBrl(100)).toBe("R$ 1,00");
    expect(formatBrl(1)).toBe("R$ 0,01");
  });
});
