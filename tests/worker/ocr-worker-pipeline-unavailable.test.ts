// D-065: worker sem pipeline configurado + varredura de publicação -> 200 com o código no corpo (não 5xx), com portas reais pelo RPC.
import { beforeAll, describe, expect, it } from "vitest";

const rpcCalls: string[] = [];
(globalThis as unknown as { __denoSupabaseClient: unknown }).__denoSupabaseClient = {
  rpc: async (fn: string) => {
    rpcCalls.push(fn);
    return { data: fn === "publication_pending" ? [] : null, error: null };
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  storage: { from: () => ({ download: async () => ({ data: null, error: { message: "x" } }) }) },
};

let handler: (req: Request) => Promise<Response> | Response;
const denoEnv: Record<string, string> = { WORKER_SHARED_SECRET: "segredo-de-teste", SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SECRET_KEY: "k", APP_ENV: "staging" };

beforeAll(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => denoEnv[k] },
    serve: (h: typeof handler) => {
      handler = h;
    },
  };
  await import("../../supabase/functions/ocr-worker/index.ts");
});

const post = (headers: Record<string, string> = { "x-worker-secret": "segredo-de-teste" }) => handler(new Request("http://worker.local/", { method: "POST", headers }));

describe("ocr-worker sem pipeline (D-065)", () => {
  it("200 com status pipeline_unavailable no corpo; a varredura de publicação ainda roda pelo RPC (portas reais, sem fixture)", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pipeline_unavailable");
    expect(rpcCalls).toContain("publication_pending");
  });
  it("sem segredo: 401 (o corpo de erro não vaza nada)", async () => {
    expect((await post({})).status).toBe(401);
    expect((await handler(new Request("http://worker.local/", { method: "GET" }))).status).toBe(405);
  });
});
