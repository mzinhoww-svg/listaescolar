import { describe, expect, it } from "vitest";
import { callbackQuerySchema, emailSchema, magicLinkInputSchema } from "@/features/auth/schemas";

describe("emailSchema", () => {
  it("aceita e-mail válido", () => {
    expect(emailSchema.parse("pai@exemplo.com")).toBe("pai@exemplo.com");
  });
  it("normaliza espaços e maiúsculas", () => {
    expect(emailSchema.parse("  Pai@Exemplo.COM  ")).toBe("pai@exemplo.com");
  });
  it("rejeita inválido, vazio e só espaços", () => {
    for (const bad of ["pai@", "sem-arroba", "", "   ", "a b@c.com"]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("magicLinkInputSchema", () => {
  it("sanitiza next inseguro para /conta", () => {
    const r = magicLinkInputSchema.parse({ email: "a@b.co", next: "//evil.com" });
    expect(r.next).toBe("/conta");
  });
  it("mantém next seguro e usa /conta quando ausente", () => {
    expect(magicLinkInputSchema.parse({ email: "a@b.co", next: "/admin" }).next).toBe("/admin");
    expect(magicLinkInputSchema.parse({ email: "a@b.co" }).next).toBe("/conta");
  });
  it("rejeita e-mail inválido", () => {
    expect(magicLinkInputSchema.safeParse({ email: "x" }).success).toBe(false);
  });
});

describe("callbackQuerySchema", () => {
  it("lê code e next sanitizado", () => {
    const r = callbackQuerySchema.parse({ code: "abc", next: "https://evil.com" });
    expect(r).toMatchObject({ code: "abc", next: "/conta" });
  });
  it("aceita ausência de code e presença de error", () => {
    const r = callbackQuerySchema.parse({ error: "access_denied", error_description: "x" });
    expect(r.code).toBeUndefined();
    expect(r.error).toBe("access_denied");
  });
  it("trata valores nulos como ausentes", () => {
    expect(callbackQuerySchema.parse({ code: null, next: null, error: null }).next).toBe("/conta");
  });
});
