import { createHash, randomBytes, randomInt } from "node:crypto";

/** Token do e-mail: 32 bytes aleatórios em base64url (43 caracteres). */
export function generateEmailToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Código do WhatsApp: 6 dígitos, com zeros à esquerda. */
export function generateWhatsappCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type TokenHashInput =
  | { channel: "email"; token: string }
  | { channel: "whatsapp"; claimId: string; code: string };

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Hash sha256 em hex; é a única forma de o token chegar ao banco. O código do WhatsApp só tem 6 dígitos, por isso
 * o hash inclui a reivindicação (`<claim_id>:<código>`), igual a `claim_confirm_token` na migration 0104.
 */
export function hashToken(input: TokenHashInput): string {
  return input.channel === "email" ? sha256(input.token) : sha256(`${input.claimId}:${input.code}`);
}
