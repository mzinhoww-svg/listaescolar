import { describe, expect, it } from "vitest";

import { CURRENT_HASH_VERSION, hashSecret } from "@/features/b2b/keys/hash";

describe("hashSecret", () => {
  it("bate com o vetor conhecido de HMAC-SHA256 (RFC 4231 / exemplo padrão)", () => {
    // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog") — vetor de teste padrão, verificável em
    // qualquer implementação de referência.
    expect(hashSecret("The quick brown fox jumps over the lazy dog", "key")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("devolve 64 caracteres hex (mesmo formato do CHECK de b2b_api_keys.key_hash)", () => {
    const hash = hashSecret("segredo-qualquer", "pepper-qualquer-com-32-caracteres-ok");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("é determinístico e sensível ao pepper e ao segredo", () => {
    const a = hashSecret("segredo", "pepper-1-com-mais-de-32-caracteres-x");
    const b = hashSecret("segredo", "pepper-1-com-mais-de-32-caracteres-x");
    const c = hashSecret("segredo", "pepper-2-com-mais-de-32-caracteres-x");
    const d = hashSecret("outro-segredo", "pepper-1-com-mais-de-32-caracteres-x");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("usa hash_version 1 por padrão e aceita explicitamente", () => {
    expect(hashSecret("x", "p", CURRENT_HASH_VERSION)).toBe(hashSecret("x", "p"));
  });

  it("versão de hash desconhecida lança (nunca calcula com algoritmo que não existe)", () => {
    expect(() => hashSecret("x", "p", 2)).toThrow();
    expect(() => hashSecret("x", "p", 0)).toThrow();
  });
});
