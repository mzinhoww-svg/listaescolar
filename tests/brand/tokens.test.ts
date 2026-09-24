import { expect, it } from "vitest";
import { tokens } from "@/lib/brand/tokens";

it("expõe as cores da marca", () => {
  expect(tokens.color.tinta).toBe("#0F1B2D");
  expect(tokens.color.papel).toBe("#F5F2EA");
  expect(tokens.color["verde-certo"]).toBe("#2FCB86");
  expect(tokens.color["verde-fundo"]).toBe("#0B6B4A");
});

it("expõe raios, fonte e wordmark", () => {
  expect(tokens.radius.botao).toBe(999);
  expect(tokens.radius.card).toBe(24);
  expect(tokens.radius.campo).toBe(14);
  expect(tokens.font.familia).toBe("Plus Jakarta Sans");
  expect(tokens.font.pesos).toEqual([500, 600, 700, 800]);
  expect(tokens.wordmark.letterSpacing).toBe("-0.05em");
});
