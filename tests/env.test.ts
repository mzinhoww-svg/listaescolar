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
  for (const key of [...Object.keys(PUBLIC), ...Object.keys(SERVER), "SENTRY_DSN"]) {
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
});
