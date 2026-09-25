import { describe, expect, it } from "vitest";

import { mapError } from "@/features/claims/errors";
import { errorMessage } from "@/features/claims/messages";

const code = (pg: string, message: string) => mapError({ code: pg, message }, "x").code;

describe("mapError", () => {
  it("e-mail da conta ausente tem código próprio e texto claro", () => {
    expect(code("23514", "e-mail da conta ausente ou inválido")).toBe("account_email");
    expect(errorMessage({ code: "account_email" })).toMatch(/e-mail da conta/i);
  });
  it("aprovar sem canal ou sem evidência tem código próprio, com texto para o admin", () => {
    expect(code("23514", "aprovar exige canal confirmado")).toBe("approval_needs_channel");
    expect(code("23514", "aprovar exige ao menos uma evidência")).toBe("approval_needs_evidence");
    expect(errorMessage({ code: "approval_needs_channel" })).toMatch(/canal/i);
    expect(errorMessage({ code: "approval_needs_evidence" })).toMatch(/evidência/i);
  });
  it("23505 dos índices únicos de reivindicação vira conflito, não erro genérico", () => {
    for (const idx of ["claims_one_open_idx", "claims_one_approved_idx"]) {
      const c = code("23505", `duplicate key value violates unique constraint "${idx}"`);
      expect(c).toBe("conflict");
    }
    expect(code("23505", 'violates unique constraint "outra"')).toBe("database");
    expect(errorMessage({ code: "conflict" })).not.toBe(errorMessage({ code: "database" }));
  });
});
