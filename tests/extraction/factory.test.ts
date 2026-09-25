import { afterEach, describe, expect, it, vi } from "vitest";
import { getExtractionPipeline } from "@/features/submissions/pipeline-factory";
import { DemoExtractionPipeline } from "@/features/submissions/demo-pipeline";
import { RealExtractionPipeline } from "@/features/extraction";

const SCRIPT = JSON.stringify({
  cheap: [{ json: { items: [], overallConfidence: 0.9 } }],
  strong: [],
});
const env = (e: Record<string, string>) => {
  for (const k of [
    "NODE_ENV",
    "APP_ENV",
    "VERCEL_ENV",
    "DEMO_PIPELINE",
    "OPENROUTER_KEY",
    "AI_MODEL_CHEAP",
    "AI_MODEL_STRONG",
    "AI_MODEL_VISION",
    "FAKE_AI_SCRIPT",
  ])
    vi.stubEnv(k, "");
  for (const [k, v] of Object.entries(e)) vi.stubEnv(k, v);
};
afterEach(() => vi.unstubAllEnvs());

describe("getExtractionPipeline (S08)", () => {
  it("sem chave, modelos nem fake: null (leitura automática indisponível)", () => {
    env({ NODE_ENV: "test" });
    expect(getExtractionPipeline()).toBeNull();
  });
  it("chave + modelos barato e forte: pipeline real", () => {
    env({ NODE_ENV: "test", OPENROUTER_KEY: "k", AI_MODEL_CHEAP: "m1", AI_MODEL_STRONG: "m2" });
    expect(getExtractionPipeline()).toBeInstanceOf(RealExtractionPipeline);
  });
  it("chave sem modelos: null", () => {
    env({ NODE_ENV: "test", OPENROUTER_KEY: "k" });
    expect(getExtractionPipeline()).toBeNull();
  });
  it("fake só com APP_ENV explícito não produtivo", () => {
    env({ NODE_ENV: "production", APP_ENV: "local", FAKE_AI_SCRIPT: SCRIPT });
    expect(getExtractionPipeline()).toBeInstanceOf(RealExtractionPipeline);
  });
  it("composição de produção nunca usa o fake", () => {
    env({ NODE_ENV: "production", APP_ENV: "production", FAKE_AI_SCRIPT: SCRIPT });
    expect(getExtractionPipeline()).toBeNull();
    env({ NODE_ENV: "production", FAKE_AI_SCRIPT: SCRIPT });
    expect(getExtractionPipeline()).toBeNull();
    env({
      NODE_ENV: "production",
      APP_ENV: "local",
      VERCEL_ENV: "production",
      FAKE_AI_SCRIPT: SCRIPT,
    });
    expect(getExtractionPipeline()).toBeNull();
  });
  it("demo explícito continua tendo precedência", () => {
    env({ NODE_ENV: "test", APP_ENV: "local", DEMO_PIPELINE: "1", FAKE_AI_SCRIPT: SCRIPT });
    expect(getExtractionPipeline()).toBeInstanceOf(DemoExtractionPipeline);
  });
});
