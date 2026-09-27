import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { generateApiKey } from "@/features/b2b/keys/format";
import { hashSecret } from "@/features/b2b/keys/hash";
import { B2bApiError } from "@/features/b2b/errors";
import type { ApiHandlerDeps, RateConsumeResult } from "@/features/b2b/api/handler";
import { __resetIpRateLimiterForTests, runApiPipeline } from "@/features/b2b/api/handler";
import type { EndpointEntry } from "@/features/b2b/api/contract";

const PEPPER = "pepper-de-teste-com-mais-de-32-caracteres-0001";
const KEY = generateApiKey("test");
const KEY_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER_ID = "22222222-2222-4222-8222-222222222222";

const entry: EndpointEntry = {
  id: "test.endpoint",
  method: "GET",
  path: "/v1/test",
  scope: "schools:read",
  summary: "endpoint de teste",
  responseSchema: z.object({ ok: z.boolean() }).strict(),
  errors: ["invalid_key", "insufficient_scope", "rate_limited", "not_found", "service_unavailable", "internal_error"],
  example: { response: { ok: true } },
};

function okRate(): RateConsumeResult {
  return { allowed: true, keyValid: true, windowKind: "minute", limitValue: 60, remaining: 59, resetAt: new Date("2026-09-26T12:01:00Z") };
}

function request(headerValue: string | null = KEY.plaintext): Request {
  const headers = new Headers();
  if (headerValue !== null) headers.set("x-listacerta-key", headerValue);
  return new Request("https://api.listacerta.example/v1/test", { headers });
}

let lookupKey: ApiHandlerDeps["lookupKey"];
let consumeRate: ApiHandlerDeps["consumeRate"];
let recordUsage: ApiHandlerDeps["recordUsage"];
let afterCallbacks: Array<() => void | Promise<void>>;

function deps(overrides: Partial<ApiHandlerDeps> = {}): ApiHandlerDeps {
  return {
    pepper: () => PEPPER,
    lookupKey,
    consumeRate,
    recordUsage,
    after: (cb) => afterCallbacks.push(cb),
    now: () => new Date("2026-09-26T12:00:00Z"),
    requestId: () => "req-fixo",
    timeoutMs: 50,
    ...overrides,
  };
}

async function flushAfter(): Promise<void> {
  const pending = afterCallbacks.splice(0);
  await Promise.all(pending.map((cb) => cb()));
}

beforeEach(() => {
  lookupKey = vi.fn<ApiHandlerDeps["lookupKey"]>(async () => ({
    keyId: KEY_ID,
    partnerId: PARTNER_ID,
    environment: "test" as const,
    keyHash: hashSecret(KEY.secret, PEPPER),
    hashVersion: 1,
    scopes: ["schools:read"],
    usable: true,
    coverageUfs: null,
  }));
  consumeRate = vi.fn<ApiHandlerDeps["consumeRate"]>(async () => okRate());
  recordUsage = vi.fn<ApiHandlerDeps["recordUsage"]>(async () => undefined);
  afterCallbacks = [];
  __resetIpRateLimiterForTests();
});

const okImpl = async () => ({ data: { ok: true } });

describe("runApiPipeline", () => {
  it("sem chave -> 401 sem chamar o banco", async () => {
    const res = await runApiPipeline(entry, okImpl, deps(), request(null), {});
    expect(res.status).toBe(401);
    expect(lookupKey).not.toHaveBeenCalled();
    expect(consumeRate).not.toHaveBeenCalled();
    expect(res.headers.get("WWW-Authenticate")).toBe("ListaCerta-Key");
  });

  it("escopo errado -> 403 e AINDA ASSIM consome a cota da chave (revisão de segurança independente, achado 1a)", async () => {
    // Antes: `insufficient_scope` não consumia nem era contado em lugar nenhum (um invasor com chave válida mas
    // escopo errado podia martelar o endpoint de graça). Agora `consumeRate` roda ANTES da checagem de escopo,
    // na mesma posição que já valia para `rate_limited` — `insufficient_scope` consome cota como qualquer 4xx.
    lookupKey = vi.fn<ApiHandlerDeps["lookupKey"]>(async () => ({
      keyId: KEY_ID,
      partnerId: PARTNER_ID,
      environment: "test" as const,
      keyHash: hashSecret(KEY.secret, PEPPER),
      hashVersion: 1,
      scopes: ["lists:read"], // sem schools:read
      usable: true,
      coverageUfs: null,
    }));
    const res = await runApiPipeline(entry, okImpl, deps({ lookupKey }), request(), {});
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
    expect(consumeRate).toHaveBeenCalledTimes(1);
    expect(consumeRate).toHaveBeenCalledWith(KEY_ID, expect.any(AbortSignal));
  });

  it("escopo errado mas limite já estourado -> 429 (o limite roda antes do escopo, prioridade para quem já martelou)", async () => {
    lookupKey = vi.fn<ApiHandlerDeps["lookupKey"]>(async () => ({
      keyId: KEY_ID,
      partnerId: PARTNER_ID,
      environment: "test" as const,
      keyHash: hashSecret(KEY.secret, PEPPER),
      hashVersion: 1,
      scopes: ["lists:read"], // sem schools:read
      usable: true,
      coverageUfs: null,
    }));
    consumeRate = vi.fn<ApiHandlerDeps["consumeRate"]>(async (): Promise<RateConsumeResult> => ({
      allowed: false,
      keyValid: true,
      windowKind: "minute",
      limitValue: 60,
      remaining: 0,
      resetAt: new Date("2026-09-26T12:00:05Z"),
    }));
    const res = await runApiPipeline(entry, okImpl, deps({ lookupKey, consumeRate }), request(), {});
    expect(res.status).toBe(429);
  });

  it("consumo negado (allowed: false) -> 429 com Retry-After", async () => {
    consumeRate = vi.fn<ApiHandlerDeps["consumeRate"]>(async (): Promise<RateConsumeResult> => ({
      allowed: false,
      keyValid: true,
      windowKind: "minute",
      limitValue: 60,
      remaining: 0,
      resetAt: new Date("2026-09-26T12:00:05Z"),
    }));
    const res = await runApiPipeline(entry, okImpl, deps({ consumeRate }), request(), {});
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("key_valid = false no consumo (revogada entre lookup e consumo) -> 401", async () => {
    consumeRate = vi.fn<ApiHandlerDeps["consumeRate"]>(async (): Promise<RateConsumeResult> => ({
      allowed: false,
      keyValid: false,
      windowKind: null,
      limitValue: null,
      remaining: null,
      resetAt: null,
    }));
    const res = await runApiPipeline(entry, okImpl, deps({ consumeRate }), request(), {});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_key");
  });

  it("resposta com campo extra -> 500 internal_error; log só com o id do endpoint (nunca o valor)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const leaky = async () => ({ data: { ok: true, extra: "segredo-que-nao-devia-sair" } });
    const res = await runApiPipeline(entry, leaky, deps(), request(), {});
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("segredo-que-nao-devia-sair");
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain(entry.id);
    expect(logged).not.toContain("segredo-que-nao-devia-sair");
    spy.mockRestore();
  });

  it("impl lança B2bApiError -> mapeia para o código e status certos", async () => {
    const notFoundImpl = async () => {
      throw new B2bApiError("not_found");
    };
    const res = await runApiPipeline(entry, notFoundImpl, deps(), request(), {});
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("timeout (consumeRate lento) -> 503", async () => {
    const slow = vi.fn<ApiHandlerDeps["consumeRate"]>(() => new Promise<RateConsumeResult>((resolve) => setTimeout(() => resolve(okRate()), 500)));
    const res = await runApiPipeline(entry, okImpl, deps({ consumeRate: slow, timeoutMs: 20 }), request(), {});
    expect(res.status).toBe(503);
  });

  it("timeout do impl -> 503", async () => {
    const slowImpl = () => new Promise<{ data: { ok: boolean } }>((resolve) => setTimeout(() => resolve({ data: { ok: true } }), 500));
    const res = await runApiPipeline(entry, slowImpl, deps({ timeoutMs: 20 }), request(), {});
    expect(res.status).toBe(503);
  });

  it("timeout do lookupKey -> 503 pelo envelope padrão (nunca um 500 sem cabeçalhos)", async () => {
    const slowLookup = vi.fn<ApiHandlerDeps["lookupKey"]>(() => new Promise((resolve) => setTimeout(() => resolve(null), 500)));
    const res = await runApiPipeline(entry, okImpl, deps({ lookupKey: slowLookup, timeoutMs: 20 }), request(), {});
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("lookupKey que lança (erro de RPC) -> 500 internal_error pelo envelope padrão, nunca a exceção crua", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failingLookup = vi.fn<ApiHandlerDeps["lookupKey"]>(async () => {
      throw new Error("relation b2b_api_keys não existe (detalhe interno do Postgres)");
    });
    const res = await runApiPipeline(entry, okImpl, deps({ lookupKey: failingLookup }), request(), {});
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("relation");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    spy.mockRestore();
  });

  it("sucesso: after() chamado com o endpoint e a classe 2xx certos", async () => {
    const res = await runApiPipeline(entry, okImpl, deps(), request(), {});
    expect(res.status).toBe(200);
    await flushAfter();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ keyId: KEY_ID, endpoint: "test.endpoint", statusClass: "2xx" }));
  });

  it("403 também é contabilizado como 4xx no after()", async () => {
    lookupKey = vi.fn<ApiHandlerDeps["lookupKey"]>(async () => ({
      keyId: KEY_ID,
      partnerId: PARTNER_ID,
      environment: "test" as const,
      keyHash: hashSecret(KEY.secret, PEPPER),
      hashVersion: 1,
      scopes: [],
      usable: true,
      coverageUfs: null,
    }));
    await runApiPipeline(entry, okImpl, deps({ lookupKey }), request(), {});
    await flushAfter();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ statusClass: "4xx" }));
  });

  it("falha do after() nunca muda a resposta já construída", async () => {
    recordUsage = vi.fn<ApiHandlerDeps["recordUsage"]>(async () => {
      throw new Error("falhou ao gravar uso");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await runApiPipeline(entry, okImpl, deps({ recordUsage }), request(), {});
    expect(res.status).toBe(200);
    await expect(flushAfter()).resolves.not.toThrow();
    spy.mockRestore();
  });

  it("nenhum cabeçalho Access-Control-* em nenhuma resposta", async () => {
    const responses = await Promise.all([
      runApiPipeline(entry, okImpl, deps(), request(), {}),
      runApiPipeline(entry, okImpl, deps(), request(null), {}),
    ]);
    for (const res of responses) {
      for (const key of res.headers.keys()) expect(key.toLowerCase().startsWith("access-control")).toBe(false);
    }
  });

  it("Cache-Control: no-store em toda resposta", async () => {
    const responses = await Promise.all([
      runApiPipeline(entry, okImpl, deps(), request(), {}),
      runApiPipeline(entry, okImpl, deps(), request(null), {}),
    ]);
    for (const res of responses) expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // Revisão de segurança independente, achado 2: sem `content-length`, `request.text()` lia o stream inteiro
  // antes de qualquer checagem de tamanho. A leitura em stream corta assim que passa do limite, sem esperar o
  // corpo malicioso terminar.
  it("corpo grande sem content-length é cortado durante a leitura (413), sem esperar o stream inteiro", async () => {
    const bodyEntry: EndpointEntry = { ...entry, method: "POST", bodySchema: z.object({}).strict(), maxBodyBytes: 10, errors: [...entry.errors, "payload_too_large"] };
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 50) {
          controller.close(); // válvula de segurança: se a correção falhar, o teste falha por status errado, não trava
          return;
        }
        controller.enqueue(new TextEncoder().encode("x".repeat(20))); // 20 bytes por pull, > maxBodyBytes (10) já na 1ª
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers();
    headers.set("x-listacerta-key", KEY.plaintext);
    headers.set("content-type", "application/json");
    const req = new Request("https://api.listacerta.example/v1/test", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
    const res = await runApiPipeline(bodyEntry, okImpl, deps(), req, {});
    expect(res.status).toBe(413);
    expect(pulls).toBeLessThan(50);
    expect(cancelled).toBe(true);
  });

  // Revisão de segurança independente, achado 3: `withTimeout` só corria uma race com `setTimeout`; a consulta
  // real ao Postgres/PostgREST continuava rodando em segundo plano depois do timeout "vencer". Agora o timeout
  // aborta de verdade um `AbortSignal` passado para `lookupKey`/`consumeRate`.
  it("timeout do lookupKey aborta de verdade o AbortSignal passado (não só ignora a resposta depois)", async () => {
    let capturedSignal: AbortSignal | undefined;
    const slowLookup = vi.fn<ApiHandlerDeps["lookupKey"]>((_publicId: string, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve(null), 500));
    });
    const res = await runApiPipeline(entry, okImpl, deps({ lookupKey: slowLookup, timeoutMs: 20 }), request(), {});
    expect(res.status).toBe(503);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("timeout do consumeRate aborta de verdade o AbortSignal passado", async () => {
    let capturedSignal: AbortSignal | undefined;
    const slow = vi.fn<ApiHandlerDeps["consumeRate"]>((_keyId: string, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve(okRate()), 500));
    });
    const res = await runApiPipeline(entry, okImpl, deps({ consumeRate: slow, timeoutMs: 20 }), request(), {});
    expect(res.status).toBe(503);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(true);
  });

  // Revisão de segurança independente, achado 1b: limite por IP em memória (por instância), aplicado ANTES até de
  // olhar a chave — a 61ª requisição da mesma origem em menos de um minuto é cortada sem consultar o banco.
  it("limite por IP em memória: 61ª requisição da mesma origem em 1 min -> 429 antes de consultar a chave", async () => {
    const headers = new Headers();
    headers.set("x-listacerta-key", KEY.plaintext);
    headers.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
    const reqFromIp = () => new Request("https://api.listacerta.example/v1/test", { headers });
    let last: Response | undefined;
    for (let i = 0; i < 61; i += 1) {
      last = await runApiPipeline(entry, okImpl, deps(), reqFromIp(), {});
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
    expect(lookupKey).toHaveBeenCalledTimes(60); // a 61ª nem chega a olhar a chave
  });

  it("sem x-forwarded-for/x-real-ip -> não bloqueia por IP (só loga), segue o pipeline normal", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await runApiPipeline(entry, okImpl, deps(), request(), {});
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
