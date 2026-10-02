// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { forwardIngest, MAX_BODY_BYTES } from "@/lib/analytics/ingest";

const ENV = { NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" };
const okFetch = () => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{"status":1}', { status: 200, headers: { "set-cookie": "ph=1", "content-type": "application/json" } }));
const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://listacerta.test/ingest/${path}`, { method: "POST", body: "{}", ...init });
const call = (path: string, init?: RequestInit, env: Record<string, string | undefined> = ENV, fetchImpl: ReturnType<typeof okFetch> = okFetch()) =>
  forwardIngest(req(path, init), path.replace(/\/$/, "").split("/"), { env, fetchImpl }).then((res) => ({ res, fetchImpl }));

describe("/ingest (route handler)", () => {
  it("repassa i/v0/e e batch ao host configurado, com POST", async () => {
    for (const p of ["i/v0/e", "batch"]) {
      const { res, fetchImpl } = await call(p);
      expect(res.status).toBe(200);
      expect(fetchImpl.mock.calls[0]![0]).toBe(`https://eu.i.posthog.com/${p}`);
      expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ method: "POST", redirect: "manual" });
    }
  });

  it("outros caminhos, barra final e caminho com truque viram 404 sem chamar o destino", async () => {
    for (const p of ["decide", "s", "i/v0/e/", "batch/", "i/v0/e/../decide", "..%2Fdecide", "batch/x", "e"]) {
      const { res, fetchImpl } = await call(p);
      expect(res.status, p).toBe(404);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("só POST: GET/PUT/DELETE recebem 405", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const fetchImpl = okFetch();
      const res = await forwardIngest(new Request("https://listacerta.test/ingest/batch", { method }), ["batch"], { env: ENV, fetchImpl });
      expect(res.status, method).toBe(405);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("repassa APENAS content-type: nada de cookie, authorization, referer, x-forwarded-*, x-real-ip, user-agent", async () => {
    const { fetchImpl } = await call("batch", {
      headers: {
        "content-type": "application/json",
        cookie: "sb=secret",
        authorization: "Bearer x",
        referer: "https://listacerta.test/lista/123",
        "x-forwarded-for": "203.0.113.9",
        "x-real-ip": "203.0.113.9",
        "user-agent": "Mozilla/5.0 (usuario)",
        origin: "https://listacerta.test",
      },
    });
    const sent = new Headers(fetchImpl.mock.calls[0]![1]!.headers);
    expect([...sent.keys()]).toEqual(["content-type"]);
    expect(sent.get("content-type")).toBe("application/json");
  });

  it("corpo acima de 64 KB (declarado ou real) vira 413 sem chamar o destino", async () => {
    const big = "x".repeat(MAX_BODY_BYTES + 1);
    const a = await call("batch", { body: big });
    expect(a.res.status).toBe(413);
    expect(a.fetchImpl).not.toHaveBeenCalled();
    const b = await call("batch", { body: big, headers: { "content-length": String(big.length) } });
    expect(b.res.status).toBe(413);
    const ok = await call("batch", { body: "x".repeat(MAX_BODY_BYTES) });
    expect(ok.res.status).toBe(200);
  });

  it("a resposta não leva cookie nem cabeçalho do destino", async () => {
    const { res } = await call("i/v0/e");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe('{"status":1}');
  });

  it("destino fora da regra isAllowedHost ou sem chave: 404 e nenhuma chamada", async () => {
    for (const env of [{}, { ...ENV, NEXT_PUBLIC_POSTHOG_HOST: "http://evil.example" }, { ...ENV, NEXT_PUBLIC_POSTHOG_HOST: "ftp://x" }]) {
      const { res, fetchImpl } = await call("batch", undefined, env);
      expect(res.status).toBe(404);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    const local = await call("batch", undefined, { ...ENV, NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:54999" });
    expect(local.res.status).toBe(200);
  });

  it("falha ou erro do destino vira 502 sem vazar detalhe", async () => {
    const boom = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      throw new Error("dns");
    });
    const { res } = await call("batch", undefined, ENV, boom);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("{}");
  });
});
