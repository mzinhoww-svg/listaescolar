import { randomBytes, randomInt } from "node:crypto";

// Formato da chave `x-listacerta-key` (S24, Global Constraints): `lc_<env>_<id>_<secret>`.
// `id`: 12 caracteres Crockford base32 (identificador público, sem I/L/O/U — não confunde 0/O, 1/I/L).
// `secret`: 32 bytes de `randomBytes` em base64url (43 caracteres, sem padding).
// Puro (sem I/O); o hash mora em `./hash.ts` (server-only, exige o pepper do servidor).

export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PUBLIC_ID_LENGTH = 12;
export const SECRET_BYTES = 32;
/** Tamanho de `randomBytes(32).toString("base64url")` (sem padding). */
export const SECRET_LENGTH = 43;

export type ApiKeyEnvironment = "live" | "test";
export const API_KEY_ENVIRONMENTS = ["live", "test"] as const;

export type GeneratedApiKey = {
  plaintext: string;
  publicId: string;
  secret: string;
  last4: string;
  environment: ApiKeyEnvironment;
};

/** Gera uma chave nova. O texto claro (`plaintext`) só existe aqui e no retorno da Server Action; nunca é logado. */
export function generateApiKey(environment: ApiKeyEnvironment): GeneratedApiKey {
  const publicId = Array.from({ length: PUBLIC_ID_LENGTH }, () => CROCKFORD_BASE32_ALPHABET[randomInt(0, CROCKFORD_BASE32_ALPHABET.length)]).join("");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { plaintext: `lc_${environment}_${publicId}_${secret}`, publicId, secret, last4: secret.slice(-4), environment };
}

export type ParsedApiKey = { environment: ApiKeyEnvironment; publicId: string; secret: string };

// Âncorada (^...$) e sem flags de espaço: espaço, cabeçalho repetido (Headers.get junta com ", ") e lixo qualquer
// falham no match, não só nas bordas.
const API_KEY_PATTERN = new RegExp(`^lc_(live|test)_([0-9A-HJKMNP-TV-Z]{${PUBLIC_ID_LENGTH}})_([A-Za-z0-9_-]{${SECRET_LENGTH}})$`);

/** Cabeçalho ausente, malformado (prefixo, alfabeto, tamanho, espaço, valor duplicado) -> `null`, sem tocar o banco. */
export function parseApiKey(header: string | null | undefined): ParsedApiKey | null {
  if (typeof header !== "string" || header.length === 0) return null;
  const match = API_KEY_PATTERN.exec(header);
  if (!match) return null;
  const [, environment, publicId, secret] = match;
  return { environment: environment as ApiKeyEnvironment, publicId: publicId!, secret: secret! };
}
