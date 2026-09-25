import { describe, expect, it } from "vitest";

import { LEAD_CODE_PATTERN, normalizeLeadCode } from "@/features/leads/code";

describe("normalizeLeadCode", () => {
  const ok: [string, string][] = [
    ["LC-5TJ1", "LC-5TJ1"],
    ["lc-5tj1", "LC-5TJ1"],
    ["  lc-5tj1  ", "LC-5TJ1"],
    ["LC-5TJl", "LC-5TJ1"],
    ["LC-5TJI", "LC-5TJ1"],
    ["LC-O0I1", "LC-0011"],
    ["LC5TJ1", "LC-5TJ1"],
    ["LC 5TJ1", "LC-5TJ1"],
    ["LC-5TJ12", "LC-5TJ12"],
    ["LC-5TJ12X", "LC-5TJ12X"],
  ];
  for (const [input, expected] of ok) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => expect(normalizeLeadCode(input)).toBe(expected));
  }

  const bad = ["", "   ", "LC-", "LC-ABC", "LC-5TJ12XZ", "LC-5TJU", "LC-5T J1", "XX-5TJ1", "5TJ1", "LC-5TJ1;drop", "LC-5T\nJ1", "LC-５TJ1", "LC-5T\u0000J1", "LC--5TJ1"];
  for (const input of bad) {
    it(`recusa ${JSON.stringify(input)}`, () => expect(normalizeLeadCode(input)).toBeNull());
  }

  it("recusa não-string e entrada gigante", () => {
    expect(normalizeLeadCode(undefined as unknown as string)).toBeNull();
    expect(normalizeLeadCode(null as unknown as string)).toBeNull();
    expect(normalizeLeadCode(123 as unknown as string)).toBeNull();
    expect(normalizeLeadCode("LC-" + "A".repeat(10_000))).toBeNull();
  });

  it("o padrão exportado é o do banco", () => {
    expect(LEAD_CODE_PATTERN.source).toBe("^LC-[0-9A-HJKMNP-TV-Z]{4,6}$");
  });
});
