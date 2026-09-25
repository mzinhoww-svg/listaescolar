import { afterEach, describe, expect, it, vi } from "vitest";

import { assertDemoAllowed, getPipelineFlags } from "@/lib/env";
import { extractionResultSchema, submitMetaSchema } from "@/features/submissions/schemas";

const meta = {
  profileId: "00000000-0000-4000-8000-000000000001",
  source: "parent",
  grade: "3º ano",
  schoolYear: 2027,
  consent: true,
};

describe("submitMetaSchema", () => {
  it("aceita o mínimo válido", () => {
    expect(submitMetaSchema.safeParse(meta).success).toBe(true);
  });
  it.each([
    ["sem consentimento", { consent: false }],
    ["consentimento como string", { consent: "true" }],
    ["série vazia", { grade: "  " }],
    ["ano fora da faixa", { schoolYear: 1999 }],
    ["origem inválida", { source: "admin" }],
    ["profileId inválido", { profileId: "x" }],
  ])("recusa %s", (_n, patch) => {
    expect(submitMetaSchema.safeParse({ ...meta, ...patch }).success).toBe(false);
  });
});

describe("extractionResultSchema", () => {
  const ok = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.8 }], overallConfidence: 0.8, warnings: [] };
  it("aceita quantidade e unidade nulas", () => {
    expect(extractionResultSchema.safeParse({ ...ok, items: [{ name: "Caderno", quantity: null, unit: null, confidence: 1 }] }).success).toBe(true);
  });
  it("recusa confiança fora de [0,1] e item sem nome", () => {
    expect(extractionResultSchema.safeParse({ ...ok, overallConfidence: 2 }).success).toBe(false);
    expect(extractionResultSchema.safeParse({ ...ok, items: [{ name: "", quantity: 1, unit: null, confidence: 1 }] }).success).toBe(false);
  });
});

describe("flags do pipeline (env)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("DEMO_PIPELINE=1 em produção sem ALLOW_DEMO_IN_PRODUCTION é erro de validação", () => {
    expect(() => assertDemoAllowed({ DEMO_PIPELINE: "1" }, "production")).toThrow(/DEMO_PIPELINE/);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_PIPELINE", "1");
    vi.stubEnv("ALLOW_DEMO_IN_PRODUCTION", "");
    expect(() => getPipelineFlags()).toThrow(/DEMO_PIPELINE/);
  });
  it("com a flag explícita, ou fora de produção, passa", () => {
    expect(() => assertDemoAllowed({ DEMO_PIPELINE: "1", ALLOW_DEMO_IN_PRODUCTION: "1" }, "production")).not.toThrow();
    expect(() => assertDemoAllowed({ DEMO_PIPELINE: "1" }, "development")).not.toThrow();
    expect(() => assertDemoAllowed({}, "production")).not.toThrow();
  });
  it("valida valores e o tamanho do segredo do worker", () => {
    vi.stubEnv("DEMO_PIPELINE", "sim");
    expect(() => getPipelineFlags()).toThrow(/DEMO_PIPELINE/);
    vi.stubEnv("DEMO_PIPELINE", "");
    vi.stubEnv("WORKER_SHARED_SECRET", "curto");
    expect(() => getPipelineFlags()).toThrow(/WORKER_SHARED_SECRET/);
    vi.stubEnv("WORKER_SHARED_SECRET", "x".repeat(32));
    expect(getPipelineFlags().WORKER_SHARED_SECRET).toHaveLength(32);
  });
});
