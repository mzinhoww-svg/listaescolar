import "server-only";

import { randomUUID } from "node:crypto";

import { after as nextAfter } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";

import { API_DB_TIMEOUT_MS } from "../limits";
import type { KeyLookupRow } from "../keys/verify";
import { verifyApiKey } from "../keys/verify";
import { B2bApiError, B2B_API_ERROR_STATUS, type ApiErrorDetail, type B2bApiErrorCode } from "../errors";
import type { Endpoint, EndpointEntry, EndpointImpl } from "./contract";
import { apiError, apiSuccess, type ApiEnvironment } from "./envelope";
import { rateLimitHeaders, retryAfterSeconds } from "./rate-headers";
import { recordUsage as recordUsageRpc, statusClassOf, type UsageStatusClass } from "./usage";

// Pipeline único de todo endpoint autenticado da API `/v1` (S24, Global Constraints): pepper -> chave -> escopo ->
// `b2b_rate_consume` -> parse de entrada -> `impl` -> `response.strict().parse` -> cabeçalhos -> `after(recordUsage)`.
// `withApiKey(entry, impl)` é o que os `route.ts` usam; `runApiPipeline` (com deps injetadas) é o que os testes de
// domínio usam com um repositório falso.

export type RateConsumeResult = {
  allowed: boolean;
  keyValid: boolean;
  windowKind: "minute" | "day" | null;
  limitValue: number | null;
  remaining: number | null;
  resetAt: Date | null;
};

export type ApiHandlerDeps = {
  pepper: () => string | undefined;
  /** `signal` (achado 3, revisão de segurança independente): quando o timeout vence, o `AbortController` de dentro
   * do pipeline chama `.abort()` de verdade nele — a implementação real (`realLookupKey`) encaminha para
   * `.abortSignal()` do supabase-js, cancelando a consulta no Postgres/PostgREST, não só ignorando a resposta tarde. */
  lookupKey: (publicId: string, signal?: AbortSignal) => Promise<KeyLookupRow | null>;
  consumeRate: (keyId: string, signal?: AbortSignal) => Promise<RateConsumeResult>;
  recordUsage: (info: { keyId: string; endpoint: string; statusClass: UsageStatusClass; matchTotal?: number; matchMatched?: number }) => Promise<void>;
  /** `next/server`'s `after()` em produção; nos testes de domínio, uma função-espiã síncrona. */
  after: (cb: () => void | Promise<void>) => void;
  now: () => Date;
  requestId: () => string;
  timeoutMs: number;
};

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Type": "application/json; charset=utf-8",
} as const;

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("tempo esgotado")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Como `withTimeout`, mas para chamadas que aceitam um `AbortSignal` (achado 3, revisão de segurança independente):
 * quando o timeout vence, aborta de verdade o `AbortController` (a chamada real ao Postgres/PostgREST é cancelada
 * via `.abortSignal()` do supabase-js, não só ignorada depois de resolver em segundo plano). */
function withAbortTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError("tempo esgotado"));
    }, ms);
    fn(controller.signal).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ---- Limite por IP em memória (achado 1b, revisão de segurança independente) ----------------------------------
// Primeira camada, por INSTÂNCIA (um `Map` de módulo, não compartilhado entre lambdas/instâncias da Vercel) —
// roda ANTES de tocar o banco (antes até do pepper/`verifyApiKey`). Ruling (ver ledger-comercio.md, item 1b): 60
// requisições/minuto por IP, janela fixa. O limite de VERDADE, entre todas as instâncias, é pendência do HUMANO no
// Vercel Firewall/Edge Config (ver docs/superpowers/PROGRESS.md, "Pendências humanas") — este código nunca toca
// infraestrutura, só aplica a primeira camada em memória do processo.
const IP_RATE_LIMIT_WINDOW_MS = 60_000;
const IP_RATE_LIMIT_MAX_PER_WINDOW = 60;

type IpBucket = { windowStart: number; count: number };
const ipRateBuckets = new Map<string, IpBucket>();

/** Só para teste: o limitador por IP é estado de módulo (compartilhado entre chamadas no mesmo processo). */
export function __resetIpRateLimiterForTests(): void {
  ipRateBuckets.clear();
}

/** Primeiro valor de `x-forwarded-for` (a Vercel prefixa o IP real do cliente na frente da lista) ou, na ausência
 * dele, `x-real-ip`. `null` quando nenhum dos dois está presente — sem IP identificável, NÃO bloqueia (só loga);
 * bloquear às cegas puniria todo mundo atrás do mesmo proxy sem cabeçalho. */
function clientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

function checkIpRateLimit(ip: string, nowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = ipRateBuckets.get(ip);
  if (!bucket || nowMs - bucket.windowStart >= IP_RATE_LIMIT_WINDOW_MS) {
    ipRateBuckets.set(ip, { windowStart: nowMs, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > IP_RATE_LIMIT_MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + IP_RATE_LIMIT_WINDOW_MS - nowMs) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// ---- Leitura do corpo com corte em stream (achado 2, revisão de segurança independente) ------------------------
class PayloadTooLargeError extends Error {}

/** Lê `request.body` (um `ReadableStream`) pedaço a pedaço, cortando ASSIM QUE passar de `maxBytes` — nunca espera
 * o stream inteiro terminar antes de checar o tamanho. Sem `content-length` (ou com um valor mentiroso, menor que
 * o corpo de verdade), `request.text()` lia tudo antes de qualquer checagem; um corpo malicioso grande sem esse
 * cabeçalho passava batido pela checagem existente e só era rejeitado (`payload_too_large`) depois de consumir
 * tempo/memória lendo o stream inteiro. */
async function readBodyLimited(request: Request, maxBytes: number): Promise<string> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

function baseHeaders(requestId: string): Headers {
  const headers = new Headers(NO_STORE_HEADERS);
  headers.set("X-Request-Id", requestId);
  return headers;
}

function errorResponse(code: B2bApiErrorCode, requestId: string, headers: Headers, details?: readonly ApiErrorDetail[]): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (code === "invalid_key") headers.set("WWW-Authenticate", "ListaCerta-Key");
  return new Response(JSON.stringify(apiError(code, requestId, details)), { status: B2B_API_ERROR_STATUS[code], headers });
}

/** Produz os handlers dos métodos HTTP fora de `allowed` para o mesmo caminho, todos `405` com `Allow`. */
type HttpMethod = (typeof ALL_METHODS)[number];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function zodDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({ path: issue.path.map((p) => String(p)).join(".") || "(raiz)", code: issue.code }));
}

/** Query string -> objeto simples (chave repetida vira array, o `.strict()` do esquema recusa o que não esperar). */
function queryToObject(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

export async function runApiPipeline(
  entry: EndpointEntry,
  impl: Endpoint["impl"],
  deps: ApiHandlerDeps,
  request: Request,
  rawParams: Record<string, string>,
): Promise<Response> {
  const requestId = deps.requestId();
  const headers = baseHeaders(requestId);

  // Achado 1b (revisão de segurança independente): limite por IP roda ANTES de tudo — antes até do pepper e da
  // consulta da chave —, sem tocar o banco. Primeira camada, por instância; ver Ruling no ledger para o porquê do
  // limite global de verdade (entre instâncias) ser pendência do humano no Vercel Firewall.
  const ip = clientIp(request);
  if (ip) {
    const ipCheck = checkIpRateLimit(ip, deps.now().getTime());
    if (!ipCheck.allowed) {
      headers.set("Retry-After", String(ipCheck.retryAfterSeconds));
      return errorResponse("rate_limited", requestId, headers);
    }
  } else {
    console.warn("b2b ip rate limit: sem x-forwarded-for/x-real-ip identificável — requisição não limitada por IP");
  }

  const pepper = deps.pepper();
  if (!pepper) return errorResponse("service_unavailable", requestId, headers);

  const header = request.headers.get("x-listacerta-key");
  let verified: Awaited<ReturnType<typeof verifyApiKey>>;
  try {
    // `deps.lookupKey` é uma chamada de rede (RPC); sem timeout, um lookup travado ficaria pendurado até o limite
    // da função em vez de responder 503 em 8s (Global Constraints). O timeout (achado 3) usa um `AbortController`
    // de verdade: quando vence, `.abort()` é chamado e a implementação real cancela a consulta no
    // Postgres/PostgREST via `.abortSignal()`, em vez de só ignorar a resposta que chega depois.
    const timedLookup = (publicId: string) => withAbortTimeout((signal) => deps.lookupKey(publicId, signal), deps.timeoutMs);
    verified = await verifyApiKey(header, { pepper, lookup: timedLookup });
  } catch (error) {
    if (error instanceof TimeoutError) return errorResponse("service_unavailable", requestId, headers);
    console.error("verificar chave b2b", error instanceof Error ? error.name : "erro");
    return errorResponse("internal_error", requestId, headers);
  }
  if (!verified.ok) return errorResponse(verified.reason, requestId, headers);
  const { key } = verified;

  const finish = (response: Response, statusClass?: UsageStatusClass, usage?: { matchTotal?: number; matchMatched?: number }): Response => {
    const record = () =>
      deps
        .recordUsage({
          keyId: key.keyId,
          endpoint: entry.id,
          statusClass: statusClass ?? statusClassOf(response.status),
          matchTotal: usage?.matchTotal,
          matchMatched: usage?.matchMatched,
        })
        .catch((error) => console.error("registrar uso b2b", entry.id, error instanceof Error ? error.name : "erro"));
    try {
      // `after()` (next/server) só funciona dentro do escopo de uma requisição real do App Router; fora dele
      // (chamada direta do handler exportado, como nos testes de banco) lança de forma síncrona. A gravação de
      // uso é acessória (falha nunca muda a resposta): sem escopo de requisição, grava em segundo plano do mesmo
      // jeito, só sem o adiamento pós-resposta do `after`.
      deps.after(record);
    } catch {
      void record();
    }
    return response;
  };

  // Achado 1a (revisão de segurança independente): `consumeRate` roda ANTES da checagem de escopo — uma chave
  // válida mas com escopo errado consome cota (e é contada) como qualquer outro 4xx, em vez de martelar o
  // endpoint de graça. Mesma posição que já valia para `rate_limited`; se a cota já estiver estourada, o 429
  // vence mesmo com escopo errado (quem já martelou o bastante para estourar a cota não ganha prioridade sobre
  // isso só por também errar o escopo).
  let rate: RateConsumeResult;
  try {
    rate = await withAbortTimeout((signal) => deps.consumeRate(key.keyId, signal), deps.timeoutMs);
  } catch (error) {
    if (error instanceof TimeoutError) return finish(errorResponse("service_unavailable", requestId, headers));
    console.error("consumir cota b2b", entry.id, error instanceof Error ? error.name : "erro");
    return finish(errorResponse("internal_error", requestId, headers));
  }
  if (!rate.keyValid) return finish(errorResponse("invalid_key", requestId, headers));

  if (rate.limitValue !== null && rate.resetAt !== null) {
    for (const [k, v] of Object.entries(rateLimitHeaders({ limit: rate.limitValue, remaining: rate.remaining ?? 0, resetAt: rate.resetAt }))) {
      headers.set(k, v);
    }
  }
  if (!rate.allowed) {
    if (rate.resetAt) headers.set("Retry-After", String(retryAfterSeconds(rate.resetAt, deps.now())));
    return finish(errorResponse("rate_limited", requestId, headers));
  }

  if (!key.scopes.includes(entry.scope)) {
    return finish(errorResponse("insufficient_scope", requestId, headers));
  }

  // ---- parse de entrada -------------------------------------------------
  let params: unknown = rawParams;
  if (entry.paramsSchema) {
    const parsed = entry.paramsSchema.safeParse(rawParams);
    if (!parsed.success) return finish(errorResponse("invalid_request", requestId, headers, zodDetails(parsed.error)));
    params = parsed.data;
  }

  const url = new URL(request.url);
  let query: unknown = {};
  if (entry.querySchema) {
    const parsed = entry.querySchema.safeParse(queryToObject(url));
    if (!parsed.success) return finish(errorResponse("invalid_request", requestId, headers, zodDetails(parsed.error)));
    query = parsed.data;
  }

  let body: unknown = undefined;
  if (entry.bodySchema) {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return finish(errorResponse("unsupported_media_type", requestId, headers));
    }
    const contentLengthHeader = request.headers.get("content-length");
    const maxBytes = entry.maxBodyBytes ?? 1_000_000;
    if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
      return finish(errorResponse("payload_too_large", requestId, headers));
    }
    // Achado 2 (revisão de segurança independente): SEM `content-length` (ausente, ou presente mas mentiroso e
    // menor que o corpo de verdade), `request.text()` lia o stream inteiro antes de qualquer checagem de tamanho —
    // um corpo malicioso grande passava batido por aqui e só era rejeitado depois de consumir tempo/memória lendo
    // tudo. `readBodyLimited` lê em stream e corta assim que passar de `maxBytes`, sem esperar o corpo terminar.
    let text: string;
    try {
      text = await readBodyLimited(request, maxBytes);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) return finish(errorResponse("payload_too_large", requestId, headers));
      return finish(errorResponse("invalid_request", requestId, headers));
    }
    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      return finish(errorResponse("invalid_request", requestId, headers));
    }
    const parsed = entry.bodySchema.safeParse(json);
    if (!parsed.success) return finish(errorResponse("invalid_request", requestId, headers, zodDetails(parsed.error)));
    body = parsed.data;
  }

  // ---- impl ---------------------------------------------------------------
  const environment: ApiEnvironment = key.environment;
  const ctx = { key: { keyId: key.keyId, partnerId: key.partnerId, environment, scopes: key.scopes, coverageUfs: key.coverageUfs }, requestId };

  let result: Awaited<ReturnType<Endpoint["impl"]>>;
  try {
    result = await withTimeout(impl({ ctx, params, query, body }), deps.timeoutMs);
  } catch (error) {
    if (error instanceof TimeoutError) return finish(errorResponse("service_unavailable", requestId, headers));
    if (error instanceof B2bApiError) return finish(errorResponse(error.code, requestId, headers, error.details));
    console.error("impl b2b", entry.id, error instanceof Error ? error.name : "erro");
    return finish(errorResponse("internal_error", requestId, headers));
  }

  // ---- response.strict().parse -------------------------------------------
  const validated = entry.responseSchema.safeParse(result.data);
  if (!validated.success) {
    console.error("resposta b2b fora do contrato", entry.id);
    return finish(errorResponse("internal_error", requestId, headers));
  }

  const envelope = apiSuccess(validated.data, { environment, requestId, nextCursor: result.nextCursor });
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  const httpResponse = new Response(JSON.stringify(envelope), { status: 200, headers: responseHeaders });

  // usage do carts.match leva contagens agregadas; nunca SKU.
  return finish(httpResponse, "2xx", result.usage);
}

/** Lookup real (`b2b_key_lookup`), exportado para os testes de banco montarem um `overrideDeps.lookupKey` que
 * envolve esta MESMA chamada com um efeito colateral no meio (ex.: revogar a chave entre o lookup e o consumo). */
export function realLookupKey(admin: SupabaseClient): ApiHandlerDeps["lookupKey"] {
  return async (publicId, signal) => {
    // Achado 3: `.abortSignal()` (supabase-js) encaminha o `AbortSignal` até o `fetch` do PostgREST — quando o
    // timeout do pipeline aborta, a consulta é cancelada de verdade no servidor, não só ignorada aqui.
    let query = admin.rpc("b2b_key_lookup", { p_public_id: publicId });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      keyId: row.key_id,
      partnerId: row.partner_id,
      environment: row.environment,
      keyHash: row.key_hash,
      hashVersion: row.hash_version,
      scopes: row.scopes ?? [],
      usable: row.usable,
      coverageUfs: row.coverage_ufs ?? null,
    };
  };
}

export function realConsumeRate(admin: SupabaseClient): ApiHandlerDeps["consumeRate"] {
  return async (keyId, signal) => {
    let query = admin.rpc("b2b_rate_consume", { p_key_id: keyId });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      keyValid: Boolean(row?.key_valid),
      windowKind: row?.window_kind ?? null,
      limitValue: row?.limit_value ?? null,
      remaining: row?.remaining ?? null,
      resetAt: row?.reset_at ? new Date(row.reset_at) : null,
    };
  };
}

export function realRecordUsage(admin: SupabaseClient): ApiHandlerDeps["recordUsage"] {
  return (info) => recordUsageRpc(admin, info);
}

function realPepper(): string | undefined {
  try {
    return getServerEnv().B2B_API_KEY_PEPPER;
  } catch (error) {
    // `getServerEnv()` valida TODO `serverSchema` (não só o pepper); sem log, um 503 aqui não dá pista nenhuma de
    // qual variável falhou (revisão final do branch S24). Só o nome do erro — nunca a mensagem/stack, que podem
    // ecoar o valor inválido.
    console.error("b2b pepper/env", error instanceof Error ? error.name : "erro");
    return undefined;
  }
}

/** Pode lançar de forma síncrona (`createAdminClient()` valida `SUPABASE_SECRET_KEY` na hora) — quem chama
 * (`withApiKey`) precisa envolver isto em `try/catch` para nunca deixar a exceção escapar do Route Handler sem o
 * envelope padrão. */
function buildRealDeps(): ApiHandlerDeps {
  const admin = createAdminClient();
  return {
    pepper: realPepper,
    lookupKey: realLookupKey(admin),
    consumeRate: realConsumeRate(admin),
    recordUsage: realRecordUsage(admin),
    after: (cb) => nextAfter(cb),
    now: () => new Date(),
    requestId: () => randomUUID(),
    timeoutMs: API_DB_TIMEOUT_MS,
  };
}

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
