import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_PAYLOAD = "resultados";

export const RESULTS_COOKIE_NAME = "pesquisa_auth";
export const RESULTS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Valor do cookie de resultados: HMAC-SHA256("resultados") com a senha como chave. */
export function signResultsCookie(password: string): string {
  return createHmac("sha256", password).update(COOKIE_PAYLOAD).digest("hex");
}

export function verifyResultsCookie(value: string | undefined | null, password: string): boolean {
  if (!value) return false;
  const expected = signResultsCookie(password);
  const a = Buffer.from(value, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** Compara senha em tempo constante (POST /api/pesquisa/login). */
export function passwordMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.alloc(b.length), Buffer.alloc(b.length));
    return false;
  }
  return timingSafeEqual(a, b);
}
