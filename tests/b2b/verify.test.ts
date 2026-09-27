import { timingSafeEqual } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { generateApiKey } from "@/features/b2b/keys/format";
import { hashSecret } from "@/features/b2b/keys/hash";
import { verifyApiKey, type KeyLookupRow } from "@/features/b2b/keys/verify";

const PEPPER = "pepper-de-teste-com-mais-de-32-caracteres-0001";

function rowFor(secret: string, overrides: Partial<KeyLookupRow> = {}): KeyLookupRow {
  return {
    keyId: "11111111-1111-4111-8111-111111111111",
    partnerId: "22222222-2222-4222-8222-222222222222",
    environment: "test",
    keyHash: hashSecret(secret, PEPPER),
    hashVersion: 1,
    scopes: ["schools:read", "lists:read"],
    usable: true,
    coverageUfs: null,
    ...overrides,
  };
}

describe("verifyApiKey", () => {
  it("chave correta e utilizável -> ok", async () => {
    const key = generateApiKey("test");
    const row = rowFor(key.secret);
    const lookup = vi.fn(async () => row);
    const result = await verifyApiKey(key.plaintext, { pepper: PEPPER, lookup });
    expect(result).toEqual({
      ok: true,
      key: { keyId: row.keyId, partnerId: row.partnerId, environment: row.environment, scopes: row.scopes, coverageUfs: row.coverageUfs },
    });
    expect(lookup).toHaveBeenCalledWith(key.publicId);
  });

  it("hash errado (segredo não bate com o hash gravado) -> invalid_key", async () => {
    const key = generateApiKey("test");
    const wrongSecretRow = rowFor(generateApiKey("test").secret); // hash de outro segredo
    const result = await verifyApiKey(key.plaintext, { pepper: PEPPER, lookup: async () => wrongSecretRow });
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("sem chave (cabeçalho ausente/malformado) -> invalid_key sem consultar o banco", async () => {
    const lookup = vi.fn(async () => null);
    expect(await verifyApiKey(null, { pepper: PEPPER, lookup })).toEqual({ ok: false, reason: "invalid_key" });
    expect(await verifyApiKey("lixo", { pepper: PEPPER, lookup })).toEqual({ ok: false, reason: "invalid_key" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("id público inexistente -> invalid_key, sem lançar (buffers do mesmo tamanho do caso existente)", async () => {
    // `timingSafeEqual` do Node lança RangeError se os buffers tiverem tamanhos diferentes: qualquer chamada aqui
    // que não lançasse comprovaria o tamanho igual; testamos os dois caminhos (existente e inexistente) sem mock.
    const key = generateApiKey("test");
    const row = rowFor(key.secret);
    await expect(verifyApiKey(key.plaintext, { pepper: PEPPER, lookup: async () => row })).resolves.toEqual({
      ok: true,
      key: { keyId: row.keyId, partnerId: row.partnerId, environment: row.environment, scopes: row.scopes, coverageUfs: row.coverageUfs },
    });

    const missingKey = generateApiKey("test");
    await expect(verifyApiKey(missingKey.plaintext, { pepper: PEPPER, lookup: async () => null })).resolves.toEqual({
      ok: false,
      reason: "invalid_key",
    });

    // Invariante estrutural de que o verify.ts se apoia: o hash real (HMAC-SHA256 hex) e o hash fixo usado quando o
    // id não existe têm o MESMO tamanho em bytes — por isso `timingSafeEqual` nunca lança e nunca vaza o tempo.
    const realHashBuf = Buffer.from(hashSecret("qualquer", PEPPER), "hex");
    const fixedHashBuf = Buffer.from("0".repeat(64), "hex");
    expect(realHashBuf.length).toBe(fixedHashBuf.length);
    expect(() => timingSafeEqual(realHashBuf, fixedHashBuf)).not.toThrow();
  });

  it("chave existente mas não utilizável (revogada, expirada ou parceiro fora do estado) -> invalid_key", async () => {
    const key = generateApiKey("test");
    const row = rowFor(key.secret, { usable: false });
    const result = await verifyApiKey(key.plaintext, { pepper: PEPPER, lookup: async () => row });
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("pepper ausente -> service_unavailable, sem consultar o banco", async () => {
    const lookup = vi.fn(async () => null);
    const key = generateApiKey("test");
    expect(await verifyApiKey(key.plaintext, { pepper: undefined, lookup })).toEqual({ ok: false, reason: "service_unavailable" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("hash_version que o servidor não sabe calcular -> invalid_key (nunca lança)", async () => {
    const key = generateApiKey("test");
    const row = rowFor(key.secret, { hashVersion: 99 });
    const result = await verifyApiKey(key.plaintext, { pepper: PEPPER, lookup: async () => row });
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("prefixo de ambiente do cabeçalho não bate com o ambiente da linha -> invalid_key, mesmo com hash certo (revisão de segurança independente, achado 4)", async () => {
    // Sem escalada de privilégio hoje (o ambiente USADO é sempre o da linha do banco), mas defesa em profundidade:
    // apresentar um segredo `live` com prefixo `lc_test_` (ou vice-versa) devia falhar, não só "funcionar mesmo assim".
    const liveKey = generateApiKey("live");
    const row = rowFor(liveKey.secret, { environment: "live" });
    const swapped = liveKey.plaintext.replace("lc_live_", "lc_test_");
    const result = await verifyApiKey(swapped, { pepper: PEPPER, lookup: async () => row });
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("o mesmo teste, na outra direção (test apresentado como live)", async () => {
    const testKey = generateApiKey("test");
    const row = rowFor(testKey.secret, { environment: "test" });
    const swapped = testKey.plaintext.replace("lc_test_", "lc_live_");
    const result = await verifyApiKey(swapped, { pepper: PEPPER, lookup: async () => row });
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });
});
