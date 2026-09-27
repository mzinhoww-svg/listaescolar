import "server-only";

import { timingSafeEqual } from "node:crypto";

import { parseApiKey, type ApiKeyEnvironment } from "./format";
import { hashSecret } from "./hash";

// Verificação da chave (S24, Global Constraints): cabeçalho ausente/malformado -> inválida sem consultar o banco;
// senão, lookup só leitura (sem cache) e comparação em tempo constante do HMAC. Toda falha (ausente, malformada,
// inexistente, hash errado, revogada, expirada, parceiro suspenso) devolve o MESMO resultado (`invalid_key`): o
// chamador nunca aprende qual foi a causa.

export type KeyLookupRow = {
  keyId: string;
  partnerId: string;
  environment: ApiKeyEnvironment;
  keyHash: string;
  hashVersion: number;
  scopes: readonly string[];
  /** Já considera `status = 'active'`, `expires_at` e o estado do parceiro para este ambiente (`b2b_key_lookup`). */
  usable: boolean;
  coverageUfs: readonly string[] | null;
};

export type VerifiedApiKey = {
  keyId: string;
  partnerId: string;
  environment: ApiKeyEnvironment;
  scopes: readonly string[];
  coverageUfs: readonly string[] | null;
};

export type VerifyApiKeyDeps = {
  /** `undefined`/vazio = pepper não configurado (a API responde `503 service_unavailable`). */
  pepper: string | undefined;
  /** Só leitura, sem cache. `null` = `id` público inexistente. */
  lookup: (publicId: string) => Promise<KeyLookupRow | null>;
};

export type VerifyApiKeyResult = { ok: true; key: VerifiedApiKey } | { ok: false; reason: "invalid_key" | "service_unavailable" };

/** Hash de mesmo tamanho (32 bytes / 64 hex) usado quando o `id` público não existe, para que `timingSafeEqual`
 * receba buffers do mesmo tamanho nos dois casos (existente e inexistente) e o tempo de resposta não vaze a causa. */
const FIXED_HASH_HEX = "0".repeat(64);

export async function verifyApiKey(header: string | null | undefined, deps: VerifyApiKeyDeps): Promise<VerifyApiKeyResult> {
  if (!deps.pepper) return { ok: false, reason: "service_unavailable" };

  const parsed = parseApiKey(header);
  if (!parsed) return { ok: false, reason: "invalid_key" };

  const row = await deps.lookup(parsed.publicId);

  let computed: string;
  try {
    computed = hashSecret(parsed.secret, deps.pepper, row?.hashVersion ?? 1);
  } catch {
    // hash_version desconhecida (pepper girou e esta chave nunca poderá ser validada de novo): mesmo erro público.
    return { ok: false, reason: "invalid_key" };
  }
  const target = row?.keyHash ?? FIXED_HASH_HEX;
  const computedBuf = Buffer.from(computed, "hex");
  const targetBuf = Buffer.from(target, "hex");
  const sameLength = computedBuf.length === targetBuf.length;
  const equal = sameLength && timingSafeEqual(computedBuf, sameLength ? targetBuf : computedBuf);

  // Achado 4 (revisão de segurança independente): o prefixo de ambiente do CABEÇALHO (`lc_test_`/`lc_live_`) nunca
  // era comparado ao ambiente da LINHA do banco — hoje sem escalada de privilégio real (o ambiente USADO é sempre o
  // da linha), mas é defesa em profundidade que faltava. Compara DEPOIS do `timingSafeEqual` (já resolvido acima,
  // incondicionalmente) para não introduzir um atalho de tempo que responda mais rápido só quando o ambiente bate.
  const environmentMatches = row ? parsed.environment === row.environment : false;
  if (!row || !equal || !row.usable || !environmentMatches) return { ok: false, reason: "invalid_key" };
  return {
    ok: true,
    key: { keyId: row.keyId, partnerId: row.partnerId, environment: row.environment, scopes: row.scopes, coverageUfs: row.coverageUfs },
  };
}
