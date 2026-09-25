import { describe, expect, it } from "vitest";

import { headlineFontSize, ogText } from "@/lib/og/text";

describe("ogText", () => {
  it("mantém português com acentos, cedilha e pontuação tipográfica", () => {
    expect(ogText("Colégio São José · 1º ano – “Lista”")).toBe("Colégio São José · 1º ano – “Lista”");
  });
  it("colapsa espaços e controles", () => {
    expect(ogText("  Escola \n  Modelo\t")).toBe("Escola Modelo");
  });
  it.each(["Escola 🎒", "学校", "Ελλάδα", "Escola ‮gpj"])("%j cai na imagem genérica (null)", (v) => {
    expect(ogText(v)).toBeNull();
  });
  it("vazio vira null", () => {
    expect(ogText("   ")).toBeNull();
  });
  it("corta nome muito longo com reticências", () => {
    const out = ogText("A".repeat(400));
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(140);
    expect(out).toMatch(/…$/);
  });
});

describe("headlineFontSize", () => {
  it("reduz por tamanho", () => {
    expect(headlineFontSize(20)).toBe(68);
    expect(headlineFontSize(70)).toBeLessThan(68);
    expect(headlineFontSize(120)).toBeLessThan(headlineFontSize(70));
  });
});
