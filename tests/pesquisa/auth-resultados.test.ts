import { describe, expect, it } from "vitest";
import { passwordMatches, signResultsCookie, verifyResultsCookie } from "@/lib/pesquisa/auth-resultados";

describe("signResultsCookie / verifyResultsCookie", () => {
  it("assinatura válida verifica com a mesma senha", () => {
    const cookie = signResultsCookie("senha-correta-24-caracteres");
    expect(verifyResultsCookie(cookie, "senha-correta-24-caracteres")).toBe(true);
  });

  it("assinatura de outra senha não verifica", () => {
    const cookie = signResultsCookie("senha-a");
    expect(verifyResultsCookie(cookie, "senha-b")).toBe(false);
  });

  it("valor adulterado não verifica", () => {
    const cookie = signResultsCookie("senha-correta");
    const adulterado = cookie.slice(0, -2) + (cookie.slice(-2) === "00" ? "11" : "00");
    expect(verifyResultsCookie(adulterado, "senha-correta")).toBe(false);
  });

  it("cookie ausente ou vazio não verifica", () => {
    expect(verifyResultsCookie(undefined, "senha")).toBe(false);
    expect(verifyResultsCookie(null, "senha")).toBe(false);
    expect(verifyResultsCookie("", "senha")).toBe(false);
  });

  it("valor não-hex não lança e não verifica", () => {
    expect(verifyResultsCookie("não é hex!!", "senha")).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("senha igual bate", () => {
    expect(passwordMatches("abc123", "abc123")).toBe(true);
  });

  it("senha diferente (mesmo tamanho) não bate", () => {
    expect(passwordMatches("abc123", "abc124")).toBe(false);
  });

  it("senha de tamanho diferente não bate e não lança", () => {
    expect(passwordMatches("abc", "abcdef")).toBe(false);
  });
});
