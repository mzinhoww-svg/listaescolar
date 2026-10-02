import { describe, expect, it } from "vitest";

import { safeErrorLabel } from "@/lib/log-error";

describe("safeErrorLabel", () => {
  it("usa o code do Postgres e nunca vaza details/message", () => {
    const label = safeErrorLabel({ code: "23505", message: "dup", details: "Key (cnpj)=(12345678000190) already exists." });
    expect(label).toBe("23505");
  });
  it("cai para o name e depois para 'erro'", () => {
    expect(safeErrorLabel(new TypeError("x"))).toBe("TypeError");
    expect(safeErrorLabel(null)).toBe("erro");
    expect(safeErrorLabel("texto")).toBe("erro");
  });
});
