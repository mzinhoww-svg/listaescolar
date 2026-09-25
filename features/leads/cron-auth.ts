import { createHash, timingSafeEqual } from "node:crypto";

/** Segredo mínimo aceito: abaixo disso o cron é tratado como não configurado. */
export const CRON_SECRET_MIN_LENGTH = 16;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** `Authorization: Bearer <segredo>` comparado em tempo constante (digests de mesmo tamanho). */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH || authorization === null) return false;
  const m = /^Bearer (.+)$/.exec(authorization);
  if (!m?.[1]) return false;
  return timingSafeEqual(digest(m[1]), digest(secret));
}
