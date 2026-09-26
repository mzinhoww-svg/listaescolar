import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { generateApiKey } from "@/features/b2b/keys/format";
import { hashSecret } from "@/features/b2b/keys/hash";
import { B2bApiError } from "@/features/b2b/errors";
import type { ApiHandlerDeps, RateConsumeResult } from "@/features/b2b/api/handler";
import { runApiPipeline } from "@/features/b2b/api/handler";
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

  it("escopo errado -> 403 sem consumir cota", async () => {
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
    const res = await runApiPipeline(entry, okImpl, deps(), request(), {});
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
    expect(consumeRate).not.toHaveBeenCalled();
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
});
