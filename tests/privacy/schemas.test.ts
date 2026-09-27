import { describe, expect, it } from "vitest";

import { consentIdInputSchema, DELETE_ACCOUNT_CONFIRMATION_WORD, deleteAccountInputSchema } from "@/features/privacy/schemas";

describe("deleteAccountInputSchema", () => {
  it("aceita a palavra de confirmação, com espaço e caixa livres", () => {
    for (const v of [DELETE_ACCOUNT_CONFIRMATION_WORD, " excluir ", "EXCLUIR", "Excluir"]) {
      expect(deleteAccountInputSchema.safeParse({ confirmation: v }).success).toBe(true);
    }
  });

  it("recusa qualquer outra coisa (clique acidental não basta)", () => {
    for (const v of ["", "excluira", "exclui", "sim", "delete", "  "]) {
      expect(deleteAccountInputSchema.safeParse({ confirmation: v }).success).toBe(false);
    }
  });
});

describe("consentIdInputSchema", () => {
  it("só aceita uuid", () => {
    expect(consentIdInputSchema.safeParse("00000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(consentIdInputSchema.safeParse("não é uuid").success).toBe(false);
    expect(consentIdInputSchema.safeParse(null).success).toBe(false);
  });
});
