import "server-only";

import { createHmac } from "node:crypto";

// Hash da chave: `HMAC-SHA256(pepper do servidor, secret)` em hex (64 caracteres) — só isto vai ao banco
// (`b2b_api_keys.key_hash`). O pepper (`B2B_API_KEY_PEPPER`) nunca sai do processo Node; o hash é calculado aqui.

/** Versão atual do algoritmo/formato de hash (`b2b_api_keys.hash_version`). Reservada para rotação futura do pepper. */
export const CURRENT_HASH_VERSION = 1;

/** HMAC-SHA256(pepper, secret) em hex. Só a versão 1 existe hoje; outra versão é erro de programação (o repositório
 * nunca deve chamar isto com uma versão que o servidor não sabe calcular). */
export function hashSecret(secret: string, pepper: string, version: number = CURRENT_HASH_VERSION): string {
  if (version !== CURRENT_HASH_VERSION) {
    throw new Error(`hash_version não suportada: ${version}`);
  }
  return createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
}
