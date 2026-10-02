import "server-only";

import { randomUUID } from "node:crypto";

import type { Endpoint, EndpointEntry, EndpointImpl } from "./contract";
import { buildRealDeps } from "./deps-real";
import type { ApiHandlerDeps } from "./handler-types";
import { runApiPipeline } from "./handler";
import { isRecord } from "./request-parsing";
import { baseHeaders, errorResponse } from "./response";

// D-158 (S19): extraído de handler.ts (549 linhas) — sem mudança de comportamento, só posição.

/** Handler de produção: `export const GET = withApiKey(entry, impl);` num `route.ts`. `overrideDeps` só para teste. */
export function withApiKey<TParams, TQuery, TBody, TResponse>(
  entry: EndpointEntry<TParams, TQuery, TBody, TResponse>,
  impl: EndpointImpl<TParams, TQuery, TBody, TResponse>,
  overrideDeps?: Partial<ApiHandlerDeps>,
) {
  // Cada `route.ts` chama isto com o par (`entry`, `impl`) concreto do PRÓPRIO endpoint (tipagem completa no
  // call site); aqui dentro o pipeline é genérico (mesmo apagamento de tipo do registro, via `unknown`, nunca
  // `any` — ver `api/endpoints/index.ts`), porque `runApiPipeline` trata toda entrada como dado validado por Zod
  // em tempo de execução, não por tipo estático.
  const genericEntry = entry as unknown as EndpointEntry;
  const genericImpl = impl as unknown as Endpoint["impl"];
  return async (request: Request, ctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    let deps: ApiHandlerDeps;
    try {
      // `buildRealDeps()` chama `createAdminClient()`, que valida `SUPABASE_SECRET_KEY` de forma síncrona e
      // lança se estiver ausente/malformada — sem este `try`, a exceção sairia do Route Handler sem o envelope
      // padrão (sem `no-store`, `nosniff`, `X-Request-Id`), como um 500 genérico do Next.
      deps = { ...buildRealDeps(), ...overrideDeps };
    } catch (error) {
      const requestId = randomUUID();
      console.error("configurar handler b2b", genericEntry.id, error instanceof Error ? error.name : "erro");
      return errorResponse("service_unavailable", requestId, baseHeaders(requestId));
    }
    const paramsValue: unknown = await ctx.params;
    const rawParams = isRecord(paramsValue) ? (paramsValue as Record<string, string>) : {};
    return runApiPipeline(genericEntry, genericImpl, deps, request, rawParams);
  };
}
