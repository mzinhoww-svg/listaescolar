import type { z } from "zod";

import type { B2bApiErrorCode } from "../errors";
import type { B2bScope } from "../scopes";
import type { ApiEnvironment } from "./envelope";

// Contrato único da API `/v1` (S24). Cada endpoint é um par (`entry`, `impl`): `entry` é dado puro (id, método,
// caminho, escopo, esquemas, exemplo) usado pelo registro/`openapi.json`/teste de completude; `impl` é a função que
// o `handler` chama depois de autenticar, verificar escopo, consumir a cota e validar a entrada.

export type VerifiedApiKeyContext = {
  keyId: string;
  partnerId: string;
  environment: ApiEnvironment;
  scopes: readonly string[];
  coverageUfs: readonly string[] | null;
};

/** `signal` (achado D, revisão de segurança independente, rodada 2): repassado pelo `runApiPipeline` a partir do
 * `AbortController` do timeout — cada `impl` que faz sua própria chamada `admin.rpc(...)` (ver
 * `features/b2b/api/endpoints/*.ts`) deve encadear `.abortSignal(ctx.signal)` nela, mesmo padrão de
 * `realLookupKey`/`realConsumeRate` em `handler.ts`, para que o timeout cancele a consulta de verdade no
 * Postgres/PostgREST, não só ignore a resposta tardia. `undefined` fora do pipeline real (ex.: um teste que chama
 * `impl` direto sem passar por `runApiPipeline`). */
export type ApiRequestContext = { key: VerifiedApiKeyContext; requestId: string; signal?: AbortSignal };

export type EndpointExample = { request?: unknown; response: unknown };

export type EndpointEntry<TParams = unknown, TQuery = unknown, TBody = unknown, TResponse = unknown> = {
  id: string;
  method: "GET" | "POST";
  /** Caminho no estilo OpenAPI (`/v1/schools/{inep}`), sem depender da estrutura de pastas do App Router. */
  path: string;
  scope: B2bScope;
  summary: string;
  paramsSchema?: z.ZodType<TParams>;
  querySchema?: z.ZodType<TQuery>;
  bodySchema?: z.ZodType<TBody>;
  /** Tamanho máximo do corpo em bytes; só relevante quando há `bodySchema`. */
  maxBodyBytes?: number;
  responseSchema: z.ZodType<TResponse>;
  errors: readonly B2bApiErrorCode[];
  example: EndpointExample;
};

export type EndpointImplInput<TParams, TQuery, TBody> = { ctx: ApiRequestContext; params: TParams; query: TQuery; body: TBody };
export type EndpointImplOutput<TResponse> = { data: TResponse; nextCursor?: string | null; usage?: { matchTotal?: number; matchMatched?: number } };
export type EndpointImpl<TParams = unknown, TQuery = unknown, TBody = unknown, TResponse = unknown> = (
  input: EndpointImplInput<TParams, TQuery, TBody>,
) => Promise<EndpointImplOutput<TResponse>>;

// `Endpoint` (sem parâmetros concretos, `unknown` nas quatro posições) é o tipo de ARMAZENAMENTO heterogêneo do
// registro (`ENDPOINTS` em `api/endpoints/index.ts`): cada `defineEndpoint` abaixo infere seus próprios tipos
// concretos (mantidos no `schoolsEndpoint`/`schoolEndpoint`/... exportado por cada módulo, usados pelos `route.ts`
// com tipagem completa); só ao entrar no array heterogêneo o tipo estático é apagado, por um cast duplo através de
// `unknown` (nunca `any`) em `api/endpoints/index.ts` — seguro porque o `handler` já validou os dados concretos por
// Zod antes de chamar `impl` (Ruling S24 · Task 2).
export type Endpoint<TParams = unknown, TQuery = unknown, TBody = unknown, TResponse = unknown> = {
  entry: EndpointEntry<TParams, TQuery, TBody, TResponse>;
  impl: EndpointImpl<TParams, TQuery, TBody, TResponse>;
};

/** Empacota `entry` (dado puro) e `impl` (função) num único objeto; usado pelo registro e por `withApiKey`. */
export function defineEndpoint<TParams, TQuery, TBody, TResponse>(
  entry: EndpointEntry<TParams, TQuery, TBody, TResponse>,
  impl: EndpointImpl<TParams, TQuery, TBody, TResponse>,
): Endpoint<TParams, TQuery, TBody, TResponse> {
  return { entry, impl };
}
