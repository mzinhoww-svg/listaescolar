import { describe, expect, it } from "vitest";

import { API_KEY_ENVIRONMENTS, CROCKFORD_BASE32_ALPHABET, generateApiKey, parseApiKey, PUBLIC_ID_LENGTH, SECRET_LENGTH } from "@/features/b2b/keys/format";

describe("generateApiKey", () => {
  for (const env of API_KEY_ENVIRONMENTS) {
    it(`gera uma chave ${env} bem formada e reparseável`, () => {
      const key = generateApiKey(env);
      expect(key.plaintext).toBe(`lc_${env}_${key.publicId}_${key.secret}`);
      expect(key.publicId).toHaveLength(PUBLIC_ID_LENGTH);
      expect(key.secret).toHaveLength(SECRET_LENGTH);
      expect(key.last4).toBe(key.secret.slice(-4));
      expect([...key.publicId].every((c) => CROCKFORD_BASE32_ALPHABET.includes(c))).toBe(true);
      const parsed = parseApiKey(key.plaintext);
      expect(parsed).toEqual({ environment: env, publicId: key.publicId, secret: key.secret });
    });
  }

  it("não repete o id público em 500 gerações (colisão improvável)", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateApiKey("test").publicId));
    expect(ids.size).toBe(500);
  });
});

describe("parseApiKey", () => {
  const good = generateApiKey("live").plaintext;

  it("aceita uma chave bem formada", () => {
    expect(parseApiKey(good)).not.toBeNull();
  });

  it("cabeçalho ausente ou vazio -> null", () => {
    expect(parseApiKey(null)).toBeNull();
    expect(parseApiKey(undefined)).toBeNull();
    expect(parseApiKey("")).toBeNull();
  });

  it("prefixo errado -> null", () => {
    expect(parseApiKey(good.replace("lc_", "xx_"))).toBeNull();
    expect(parseApiKey(good.slice(3))).toBeNull();
  });

  it("ambiente fora de {live, test} -> null", () => {
    expect(parseApiKey(good.replace("_live_", "_prod_"))).toBeNull();
    expect(parseApiKey(good.replace("_live_", "_LIVE_"))).toBeNull();
  });

  it("id público com tamanho ou alfabeto errados -> null", () => {
    const parts = good.split("_");
    expect(parseApiKey(`lc_${parts[1]}_${parts[2]!.slice(1)}_${parts[3]}`)).toBeNull(); // 11 chars
    expect(parseApiKey(`lc_${parts[1]}_${parts[2]}O_${parts[3]}`)).toBeNull(); // 13 chars, com O fora do alfabeto
    expect(parseApiKey(`lc_${parts[1]}_${"I".repeat(12)}_${parts[3]}`)).toBeNull(); // I não é Crockford
  });

  it("segredo com tamanho ou alfabeto errados -> null", () => {
    const parts = good.split("_");
    expect(parseApiKey(`lc_${parts[1]}_${parts[2]}_${parts[3]!.slice(1)}`)).toBeNull(); // 42 chars
    expect(parseApiKey(`lc_${parts[1]}_${parts[2]}_${parts[3]}=`)).toBeNull(); // padding base64 (não é base64url puro)
  });

  it("lixo qualquer -> null", () => {
    for (const junk of ["", "   ", "Bearer abc", "lc_live__", "null", "{}", "lc_live_" + "A".repeat(12) + "_" + "B".repeat(43) + "\n"]) {
      expect(parseApiKey(junk)).toBeNull();
    }
  });

  it("espaço em qualquer posição -> null", () => {
    expect(parseApiKey(` ${good}`)).toBeNull();
    expect(parseApiKey(`${good} `)).toBeNull();
    expect(parseApiKey(good.replace("_", " "))).toBeNull();
  });

  it("cabeçalho repetido (Headers.get junta com ', ') -> null", () => {
    const headers = new Headers();
    headers.append("x-listacerta-key", good);
    headers.append("x-listacerta-key", good);
    expect(parseApiKey(headers.get("x-listacerta-key"))).toBeNull();
  });

  it("query string nunca é aceita como cabeçalho (o chamador só passa o header)", () => {
    // parseApiKey só recebe o valor do header; simular passar uma query inteira também deve falhar.
    expect(parseApiKey(`?x-listacerta-key=${good}`)).toBeNull();
  });
});
