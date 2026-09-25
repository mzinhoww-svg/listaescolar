import { afterEach, describe, expect, it, vi } from "vitest";

import { getPipelineFlags } from "@/lib/env";
import { assertPipelineEnv, isDemoEnabled } from "@/lib/pipeline-env";
import { parseSlowMs } from "../../supabase/functions/_shared/demo-lock";
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

  it("demo pedido sem APP_ENV explícito ou em produção: desligado e erro de boot", () => {
    for (const appEnv of ["", "production", "prod", "qa"]) {
      vi.stubEnv("DEMO_PIPELINE", "1");
      vi.stubEnv("APP_ENV", appEnv);
      expect(isDemoEnabled()).toBe(false);
      expect(() => assertPipelineEnv()).toThrow(/APP_ENV/);
    }
  });
  it("NODE_ENV=production não libera o demo (só APP_ENV conta)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_PIPELINE", "1");
    vi.stubEnv("APP_ENV", "");
    expect(isDemoEnabled()).toBe(false);
  });
  it.each(["local", "development", "preview", "staging"])("DEMO_PIPELINE=1 com APP_ENV=%s liga", (appEnv) => {
    vi.stubEnv("DEMO_PIPELINE", "1");
    vi.stubEnv("APP_ENV", appEnv);
    expect(isDemoEnabled()).toBe(true);
    expect(() => assertPipelineEnv()).not.toThrow();
  });
  it("sem DEMO_PIPELINE, desligado e sem erro, em qualquer ambiente", () => {
    vi.stubEnv("DEMO_PIPELINE", "");
    for (const appEnv of ["", "production", "local"]) {
      vi.stubEnv("APP_ENV", appEnv);
      expect(isDemoEnabled()).toBe(false);
      expect(() => assertPipelineEnv()).not.toThrow();
    }
  });
  it("valida valores e o tamanho do segredo do worker", () => {
    vi.stubEnv("DEMO_PIPELINE", "sim");
    expect(() => getPipelineFlags()).toThrow(/DEMO_PIPELINE/);
    vi.stubEnv("DEMO_PIPELINE", "");
    vi.stubEnv("APP_ENV", "producao");
    expect(() => getPipelineFlags()).toThrow(/APP_ENV/);
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("WORKER_SHARED_SECRET", "curto");
    expect(() => getPipelineFlags()).toThrow(/WORKER_SHARED_SECRET/);
    vi.stubEnv("WORKER_SHARED_SECRET", "x".repeat(32));
    expect(getPipelineFlags().WORKER_SHARED_SECRET).toHaveLength(32);
  });
  it("DEMO_SLOW_MS inválido (NaN, negativo, vazio) cai no padrão", () => {
    expect(parseSlowMs("abc")).toBe(15_000);
    expect(parseSlowMs("-5")).toBe(15_000);
    expect(parseSlowMs("")).toBe(15_000);
    expect(parseSlowMs(undefined)).toBe(15_000);
    expect(parseSlowMs("3000")).toBe(3000);
    expect(parseSlowMs("9999999")).toBe(120_000);
  });
});

describe("instrumentation.register", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("aborta o boot (nodejs) com demo em ambiente não permitido", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("DEMO_PIPELINE", "1");
    vi.stubEnv("APP_ENV", "production");
    const { register } = await import("../../instrumentation");
    await expect(register()).rejects.toThrow(/APP_ENV/);
  });
});
