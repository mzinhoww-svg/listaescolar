import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv } from "@/lib/env";
import { getPublicEnv } from "@/lib/env.public";

const PUBLIC = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const SERVER = {
  SUPABASE_SECRET_KEY: "sb_secret_test",
  OPENROUTER_KEY: "or-test",
  AI_MODEL_CHEAP: "modelo/barato",
  AI_MODEL_STRONG: "modelo/forte",
};

afterEach(() => vi.unstubAllEnvs());

function stub(values: Record<string, string>) {
  for (const key of [...Object.keys(PUBLIC), ...Object.keys(SERVER), "SENTRY_DSN", "APP_ENV", "B2B_CAMPAIGN_TRACKING_SECRET", "B2B_CAMPAIGN_TRACKING"]) {
    vi.stubEnv(key, "");
  }
  for (const [k, v] of Object.entries(values)) vi.stubEnv(k, v);
}

describe("getPublicEnv", () => {
  it("retorna URL e publishable key válidas", () => {
    stub(PUBLIC);
    expect(getPublicEnv()).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: PUBLIC.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLIC.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it("lança citando o nome das variáveis ausentes", () => {
    stub({});
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejeita URL inválida", () => {
    stub({ ...PUBLIC, NEXT_PUBLIC_SUPABASE_URL: "nao-e-url" });
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("não vaza valores no erro", () => {
    stub({ ...PUBLIC, NEXT_PUBLIC_SUPABASE_URL: "segredo-invalido" });
    expect(() => getPublicEnv()).not.toThrow(/segredo-invalido/);
  });
});

describe("getServerEnv", () => {
  it("retorna variáveis públicas e de servidor, SENTRY_DSN opcional", () => {
    stub({ ...PUBLIC, ...SERVER });
    const env = getServerEnv();
    expect(env.SUPABASE_SECRET_KEY).toBe("sb_secret_test");
    expect(env.AI_MODEL_CHEAP).toBe("modelo/barato");
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("lança listando as ausentes", () => {
    stub(PUBLIC);
    expect(() => getServerEnv()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => getServerEnv()).toThrow(/OPENROUTER_KEY/);
  });

  describe("B2B_CAMPAIGN_TRACKING_SECRET (S28)", () => {
    const prod = { ...PUBLIC, ...SERVER, APP_ENV: "production", B2B_CAMPAIGN_TRACKING_SECRET: "", B2B_CAMPAIGN_TRACKING: "" };
    const HEX = "a".repeat(64);

    it("falha em produção sem o segredo e sem desligar o rastreio", () => {
      stub(prod);
      expect(() => getServerEnv()).toThrow(/B2B_CAMPAIGN_TRACKING_SECRET/);
    });

    it("passa em produção com o segredo, ou com o rastreio desligado", () => {
      stub({ ...prod, B2B_CAMPAIGN_TRACKING_SECRET: HEX });
      expect(getServerEnv().B2B_CAMPAIGN_TRACKING_SECRET).toBe(HEX);
      stub({ ...prod, B2B_CAMPAIGN_TRACKING: "0" });
      expect(getServerEnv().B2B_CAMPAIGN_TRACKING_SECRET).toBeUndefined();
    });

    it("rejeita segredo curto e continua opcional fora de produção", () => {
      stub({ ...prod, B2B_CAMPAIGN_TRACKING_SECRET: "curto" });
      expect(() => getServerEnv()).toThrow(/B2B_CAMPAIGN_TRACKING_SECRET/);
      stub({ ...PUBLIC, ...SERVER, APP_ENV: "staging", B2B_CAMPAIGN_TRACKING_SECRET: "" });
      expect(getServerEnv().B2B_CAMPAIGN_TRACKING_SECRET).toBeUndefined();
    });

    it("não vaza o valor no erro e o .env.example traz a chave", () => {
      stub({ ...prod, B2B_CAMPAIGN_TRACKING_SECRET: "valor-secreto-curto" });
      expect(() => getServerEnv()).not.toThrow(/valor-secreto-curto/);
      expect(readFileSync(join(process.cwd(), ".env.example"), "utf8")).toMatch(/^B2B_CAMPAIGN_TRACKING_SECRET=$/m);
    });
  });

  it("D-009 (S19): CRON_SECRET curto não derruba getServerEnv() — o contrato de 503 é da própria rota de cron", () => {
    stub({ ...PUBLIC, ...SERVER, CRON_SECRET: "curto" });
    expect(() => getServerEnv()).not.toThrow();
    expect(getServerEnv().CRON_SECRET).toBe("curto");
  });
});
