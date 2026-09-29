import "server-only";

import { randomUUID } from "node:crypto";

import { B2B_API_ERROR_STATUS, type ApiErrorDetail, type B2bApiErrorCode } from "../errors";
import { apiError } from "./envelope";

/**
 * D-158 (S19): extraído de handler.ts (549 linhas) — sem mudança de comportamento, só posição. Cabeçalhos base e
 * envelope de erro padrão de toda resposta da API `/v1`, e o gerador de handlers `405` para métodos não
 * declarados por um `route.ts`.
 */

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof ALL_METHODS)[number];

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function baseHeaders(requestId: string): Headers {
  const headers = new Headers(NO_STORE_HEADERS);
  headers.set("X-Request-Id", requestId);
  return headers;
}

export function errorResponse(code: B2bApiErrorCode, requestId: string, headers: Headers, details?: readonly ApiErrorDetail[]): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (code === "invalid_key") headers.set("WWW-Authenticate", "ListaCerta-Key");
  return new Response(JSON.stringify(apiError(code, requestId, details)), { status: B2B_API_ERROR_STATUS[code], headers });
}

/** Devolve um handler para TODOS os métodos (inclusive os `allowed`, para o tipo de retorno não depender de
 * `noUncheckedIndexedAccess`); o `route.ts` só desestrutura os que não declarou. Os não-`allowed` respondem `405`
 * com `Allow`; chamar um dos "permitidos" por aqui nunca acontece (o `route.ts` já exporta o handler real nessa
 * chave), mas devolve o mesmo 405 em vez de nada, por segurança. */
export function otherMethods(allowed: readonly string[]): Record<HttpMethod, (request: Request) => Response> {
  const methodNotAllowed = (): Response => {
    const requestId = randomUUID();
    const headers = baseHeaders(requestId);
    headers.set("Allow", allowed.join(", "));
    return errorResponse("method_not_allowed", requestId, headers);
  };
  const out = {} as Record<HttpMethod, (request: Request) => Response>;
  for (const method of ALL_METHODS) out[method] = methodNotAllowed;
  return out;
}
