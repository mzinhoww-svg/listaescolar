import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Segredo de assinatura do webhook (S25): CSPRNG no Node, guardado CIFRADO no banco (AES-256-GCM) com chave só de
// servidor (`B2B_WEBHOOK_ENCRYPTION_KEY`, 32 bytes em hex). O texto claro nunca vai ao banco; só aqui e na
// resposta da Server Action (copiar/revelar).

export const WEBHOOK_SECRET_PREFIX = "whsec_";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** `whsec_` + 32 bytes de CSPRNG em base64url (43 caracteres). */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export type EncryptedSecret = { ciphertext: Buffer; iv: Buffer; tag: Buffer };

/** `key`: 32 bytes (hex de 64 caracteres, validado em `lib/env.ts`). */
export function encryptSecret(plaintext: string, keyHex: string): EncryptedSecret {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("chave de cifra do webhook precisa ter 32 bytes (64 caracteres hex)");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function decryptSecret(enc: EncryptedSecret, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("chave de cifra do webhook precisa ter 32 bytes (64 caracteres hex)");
  if (enc.iv.length !== IV_LENGTH || enc.tag.length !== TAG_LENGTH) throw new Error("segredo cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key, enc.iv);
  decipher.setAuthTag(enc.tag);
  return Buffer.concat([decipher.update(enc.ciphertext), decipher.final()]).toString("utf8");
}
