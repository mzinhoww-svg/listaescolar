import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> | null;
const state: { user: { id: string } | null; tables: Record<string, Row> } = { user: null, tables: {} };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) builder[m] = () => builder;
      builder.maybeSingle = async () => ({ data: state.tables[table] ?? null, error: null });
      return builder;
    },
  }),
}));
const pipeline = vi.fn();
vi.mock("@/features/submissions/pipeline-factory", () => ({ getExtractionPipeline: () => pipeline() }));

import { GET } from "@/app/api/submissions/[id]/status/route";

const ID = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";
const call = (id = ID) => GET(new Request(`http://x/api/submissions/${id}/status`) as never, { params: Promise.resolve({ id }) });

describe("GET /api/submissions/[id]/status", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.tables = {};
    pipeline.mockReset();
    pipeline.mockReturnValue({});
  });

  it("anônimo: 401 sem consultar nada", async () => {
    state.user = null;
    expect((await call()).status).toBe(401);
  });

  it("id que não é UUID: 404", async () => {
    expect((await call("../../x")).status).toBe(404);
  });

  it("envio alheio (RLS não devolve a linha): 404, nunca 403", async () => {
    state.tables = { list_submissions: null };
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("processing_async: devolve status, job e tentativas, sem resultado; não faz cache", async () => {
    state.tables = {
      list_submissions: { id: ID, status: "processing_async", is_demo: true },
      jobs: { id: "j1", status: "retrying", attempts: 2, notify_channel: "none" },
    };
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      status: "processing_async",
      jobStatus: "retrying",
      attempts: 2,
      notifyChannel: "none",
      isDemo: true,
      pipelineAvailable: true,
    });
  });

  it("review_needed: inclui o resultado válido e descarta resultado malformado", async () => {
    const result = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };
    state.tables = {
      list_submissions: { id: ID, status: "review_needed", is_demo: false },
      jobs: { id: "j1", status: "succeeded", attempts: 1, notify_channel: "none" },
      ocr_jobs: { result },
    };
    expect((await (await call()).json()).result).toEqual(result);
    state.tables.ocr_jobs = { result: { items: "lixo" } };
    expect((await (await call()).json()).result).toBeUndefined();
  });

  it("sem pipeline configurado: pipelineAvailable false (e nunca lança se o ambiente é inválido)", async () => {
    state.tables = { list_submissions: { id: ID, status: "processing_async", is_demo: false } };
    pipeline.mockReturnValue(null);
    expect((await (await call()).json()).pipelineAvailable).toBe(false);
    pipeline.mockImplementation(() => {
      throw new Error("env");
    });
    expect((await (await call()).json()).pipelineAvailable).toBe(false);
  });
});
