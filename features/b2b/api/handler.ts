import "server-only";

import { verifyApiKey } from "../keys/verify";
import { B2bApiError } from "../errors";
import type { Endpoint, EndpointEntry } from "./contract";
import { apiSuccess, type ApiEnvironment } from "./envelope";
import { rateLimitHeaders, retryAfterSeconds } from "./rate-headers";
import { statusClassOf, type UsageStatusClass } from "./usage";
import { TimeoutError, withAbortTimeout } from "./abort-timeout";
import type { ApiHandlerDeps, RateConsumeResult } from "./handler-types";
import { clientIp, peekIpRateLimit, recordIpAuthFailure } from "./ip-rate-limit";
import { queryToObject, readBodyLimited, zodDetails, PayloadTooLargeError } from "./request-parsing";
import { baseHeaders, errorResponse } from "./response";

/**
 * D-158 (S19): este arquivo tinha 549 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do
 * D-057 (S18) — nenhuma linha de LÓGICA mudou, só a posição:
 * - `handler-types.ts`: `RateConsumeResult`/`ApiHandlerDeps` (evita import circular com `deps-real.ts`).
 * - `ip-rate-limit.ts`: limite por IP em memória (achados 1b/A/B/C, revisão de segurança independente).
 * - `abort-timeout.ts`: timeout com `AbortSignal` de verdade (achado 3/D).
 * - `request-parsing.ts`: leitura do corpo em stream com corte (achado 2) e utilitários de params/query/erro Zod.
 * - `response.ts`: cabeçalhos base, envelope de erro, `otherMethods` (405).
 * - `deps-real.ts`: implementação real de `ApiHandlerDeps` (RPCs do Supabase, `after()`, relógio).
 * Este arquivo reexporta tudo dos irmãos (os testes de domínio importam daqui) e mantém `runApiPipeline`, o
 * pipeline em si. `withApiKey` (o que os `route.ts` usam) foi para `with-api-key.ts`: ele PRECISA importar
 * `runApiPipeline` daqui, então reexportá-lo por aqui criaria um import circular — os `route.ts` e o teste de
 * banco importam `withApiKey` direto de `@/features/b2b/api/with-api-key`.
 *
 * Pipeline único de todo endpoint autenticado da API `/v1` (S24, Global Constraints): pepper -> chave -> escopo ->
 * `b2b_rate_consume` -> parse de entrada -> `impl` -> `response.strict().parse` -> cabeçalhos -> `after(recordUsage)`.
 * `withApiKey(entry, impl)` é o que os `route.ts` usam; `runApiPipeline` (com deps injetadas) é o que os testes de
 * domínio usam com um repositório falso.
 */
export type { ApiHandlerDeps, RateConsumeResult } from "./handler-types";
export { TimeoutError, withAbortTimeout } from "./abort-timeout";
export { __ipRateLimiterSizeForTests, __resetIpRateLimiterForTests, __setIpRateLimiterMaxTrackedIpsForTests, clientIp } from "./ip-rate-limit";
export { PayloadTooLargeError, readBodyLimited } from "./request-parsing";
export { baseHeaders, errorResponse, otherMethods } from "./response";
export { buildRealDeps, realConsumeRate, realLookupKey, realRecordUsage } from "./deps-real";

export async function runApiPipeline(
  entry: EndpointEntry,
  impl: Endpoint["impl"],
  deps: ApiHandlerDeps,
  request: Request,
  rawParams: Record<string, string>,
): Promise<Response> {
  const requestId = deps.requestId();
  const headers = baseHeaders(requestId);

  // Achado 1b (revisão de segurança independente) + achado B (rodada 2): PEEK (leitura, sem incrementar) roda
  // ANTES de tudo — antes até do pepper e da consulta da chave —, sem tocar o banco: um IP já sobre o teto de
  // tentativas FALHAS é barrado sem gastar uma consulta. Ver Ruling no ledger para o porquê do limite global de
  // verdade (entre instâncias) ser pendência do humano no Vercel Firewall.
  const ip = clientIp(request);
  if (ip) {
    const ipCheck = peekIpRateLimit(ip, deps.now().getTime());
    if (!ipCheck.allowed) {
      headers.set("Retry-After", String(ipCheck.retryAfterSeconds));
      return errorResponse("rate_limited", requestId, headers);
    }
  } else {
    console.warn("b2b ip rate limit: sem x-vercel-forwarded-for/x-real-ip/x-forwarded-for identificável — requisição não limitada por IP");
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
  if (!verified.ok) {
    // Achado B (rodada 2): só `invalid_key` de verdade conta no balde do IP — `service_unavailable` (pepper
    // ausente, já tratado acima, mas por clareza: nunca chega aqui) é um problema operacional, não um sinal de
    // ataque, e nunca deveria ajudar a barrar um IP legítimo.
    if (verified.reason === "invalid_key" && ip) recordIpAuthFailure(ip, deps.now().getTime());
    return errorResponse(verified.reason, requestId, headers);
  }
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
  const baseCtx = { key: { keyId: key.keyId, partnerId: key.partnerId, environment, scopes: key.scopes, coverageUfs: key.coverageUfs }, requestId };

  let result: Awaited<ReturnType<Endpoint["impl"]>>;
  try {
    // Achado D (revisão de segurança independente, rodada 2): o achado 3 (rodada 1) só cobriu `lookupKey`/
    // `consumeRate`; o `impl` de cada endpoint faz suas PRÓPRIAS chamadas RPC (`features/b2b/api/endpoints/*.ts`)
    // e continuava usando o `withTimeout` antigo (sem abort de verdade). Agora o `signal` do mesmo
    // `AbortController` do timeout vai dentro de `ctx`, e cada endpoint encadeia `.abortSignal(ctx.signal)`.
    result = await withAbortTimeout((signal) => impl({ ctx: { ...baseCtx, signal }, params, query, body }), deps.timeoutMs);
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
