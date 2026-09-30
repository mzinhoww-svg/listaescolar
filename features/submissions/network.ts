import type { FormErrorCode } from "./copy";

const digestOf = (e: unknown): string => (typeof e === "object" && e !== null && "digest" in e ? String((e as { digest: unknown }).digest) : "");

/** `redirect()` e `notFound()` da Server Action viajam como erro com `digest`: quem captura precisa relançar. */
export function isControlFlowError(e: unknown): boolean {
  const d = digestOf(e);
  return d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND";
}

/** `fetch` que falha por falta de rede rejeita com `TypeError` ("Failed to fetch", "Load failed", "NetworkError…"). */
export function isNetworkFailure(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Código do erro quando a chamada da Server Action rejeita: rede fora vira `network`; o resto, `unexpected`. */
export function submitFailureCode(e: unknown): FormErrorCode {
  return isNetworkFailure(e) ? "network" : "unexpected";
}

/** Erros com os quais "Tentar de novo" faz sentido (o mesmo envio pode dar certo na segunda vez). */
export const isRetryable = (code: FormErrorCode): boolean => code === "network" || code === "unexpected";
