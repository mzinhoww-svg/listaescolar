import { createHash, timingSafeEqual } from "node:crypto";

/** Segredo mínimo aceito: abaixo disso o webhook é tratado como não configurado (503). */
export const PIX_WEBHOOK_TOKEN_MIN_LENGTH = 16;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Token do PATH (`/api/billing/pix/webhook/[token]`) comparado em tempo constante (digests de mesmo tamanho). */
export function isAuthorizedPixWebhook(pathToken: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < PIX_WEBHOOK_TOKEN_MIN_LENGTH || !pathToken) return false;
  return timingSafeEqual(digest(pathToken), digest(secret));
}
