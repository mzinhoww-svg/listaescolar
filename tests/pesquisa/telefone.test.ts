import { describe, expect, it } from "vitest";
import { normalizeWhatsappBR } from "@/lib/pesquisa/telefone";

describe("normalizeWhatsappBR", () => {
  it("normaliza com máscara", () => {
    expect(normalizeWhatsappBR("(65) 99999-1234")).toBe("+5565999991234");
  });

  it("normaliza sem formatação", () => {
    expect(normalizeWhatsappBR("65999991234")).toBe("+5565999991234");
  });

  it("normaliza já com +55", () => {
    expect(normalizeWhatsappBR("+55 65 99999-1234")).toBe("+5565999991234");
  });

  it("normaliza com 0055", () => {
    expect(normalizeWhatsappBR("0055 65 99999-1234")).toBe("+5565999991234");
  });

  it("aceita fixo (8 dígitos locais)", () => {
    expect(normalizeWhatsappBR("(65) 3333-4444")).toBe("+556533334444");
  });

  it("rejeita DDD inválido", () => {
    expect(normalizeWhatsappBR("(10) 99999-1234")).toBeNull();
    expect(normalizeWhatsappBR("(00) 99999-1234")).toBeNull();
  });

  it("rejeita quantidade errada de dígitos", () => {
    expect(normalizeWhatsappBR("659999912")).toBeNull(); // 9 dígitos: nem fixo (8) nem celular (9) completo
    expect(normalizeWhatsappBR("659999912345")).toBeNull(); // dígitos demais
    expect(normalizeWhatsappBR("123")).toBeNull();
    expect(normalizeWhatsappBR("")).toBeNull();
  });

  it("rejeita número mobile de 9 dígitos que não começa com 9", () => {
    expect(normalizeWhatsappBR("65123456789")).toBeNull();
  });
});
