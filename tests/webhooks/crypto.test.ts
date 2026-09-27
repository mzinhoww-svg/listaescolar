import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateWebhookSecret, WEBHOOK_SECRET_PREFIX } from "@/features/webhooks/crypto";

const KEY = randomBytes(32).toString("hex");

describe("generateWebhookSecret", () => {
  it("prefixo whsec_ e alta entropia, sem repetição", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(40);
  });
});

describe("encryptSecret / decryptSecret (AES-256-GCM)", () => {
  it("round-trip: decifra exatamente o texto original", () => {
    const plaintext = generateWebhookSecret();
    const enc = encryptSecret(plaintext, KEY);
    expect(decryptSecret(enc, KEY)).toBe(plaintext);
    expect(enc.ciphertext.toString("utf8")).not.toContain(plaintext);
  });

  it("chave errada não decifra (autenticação do GCM recusa)", () => {
    const plaintext = generateWebhookSecret();
    const enc = encryptSecret(plaintext, KEY);
    const wrongKey = randomBytes(32).toString("hex");
    expect(() => decryptSecret(enc, wrongKey)).toThrow();
  });

  it("ciphertext adulterado não decifra", () => {
    const plaintext = generateWebhookSecret();
    const enc = encryptSecret(plaintext, KEY);
    enc.ciphertext[0] = (enc.ciphertext[0]! ^ 0xff) as number;
    expect(() => decryptSecret(enc, KEY)).toThrow();
  });

  it("recusa chave de tamanho errado", () => {
    expect(() => encryptSecret("x", "abcd")).toThrow();
  });
});
