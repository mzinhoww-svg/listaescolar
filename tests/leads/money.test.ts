import { describe, expect, it } from "vitest";

import { LEAD_MAX_AMOUNT_CENTS, parseBrlToCents } from "@/features/leads/money";

describe("parseBrlToCents", () => {
  const ok: [string, number][] = [
    ["R$ 1.234,50", 123_450],
    ["1234,5", 123_450],
    ["1234,50", 123_450],
    ["12", 1200],
    ["0,99", 99],
    ["R$12,90", 1290],
    ["  45,00 ", 4500],
    ["100.000,00", 10_000_000],
  ];
  for (const [input, cents] of ok) it(`${input} -> ${cents}`, () => expect(parseBrlToCents(input)).toBe(cents));

  const bad = ["", "  ", "0", "0,00", "-5,00", "-1", "12,5x", "abc", "1,2,3", "12,505", "R$", "1e3", "100.000,01", "99999999999999999999", "NaN", "12,50 reais"];
  for (const input of bad) it(`recusa ${JSON.stringify(input)}`, () => expect(parseBrlToCents(input)).toBeNull());

  it("o teto é o do banco", () => {
    expect(LEAD_MAX_AMOUNT_CENTS).toBe(10_000_000);
  });
  it("recusa não-string", () => {
    expect(parseBrlToCents(undefined as unknown as string)).toBeNull();
    expect(parseBrlToCents(12 as unknown as string)).toBeNull();
  });
});
