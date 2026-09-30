import { describe, expect, it } from "vitest";

import { cartDate, cartTitle } from "@/features/cart/title";

describe("cartTitle · UX-048", () => {
  const at = new Date("2026-09-29T21:49:00Z");
  it("escola e série quando a lista de origem é pública", () => {
    expect(cartTitle({ schoolName: "Escola Demo", gradeLabel: "5º ano" }, at)).toBe("Escola Demo · 5º ano");
  });
  it("sem origem resolvível (cópia privada, demonstração): 'Carrinho de <data>' (nada inventado)", () => {
    expect(cartTitle(null, at)).toBe("Carrinho de 29/09/2026");
  });
  it("data no fuso de Cuiabá", () => {
    expect(cartDate(new Date("2026-10-01T02:30:00Z"))).toBe("30/09/2026");
  });
});
