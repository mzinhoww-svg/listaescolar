import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSiteOrigin } from "@/lib/site-url";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_ENV"];

describe("getSiteOrigin", () => {
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, "");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("NEXT_PUBLIC_SITE_URL vence e perde a barra final", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://listacerta.com.br/");
    vi.stubEnv("VERCEL_URL", "x.vercel.app");
    expect(getSiteOrigin("http://evil.test")).toBe("https://listacerta.com.br");
  });
  it("NEXT_PUBLIC_SITE_URL inválida é erro", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "nao-e-url");
    expect(() => getSiteOrigin()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
  it("produção Vercel usa VERCEL_PROJECT_PRODUCTION_URL", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "listacerta.com.br");
    vi.stubEnv("VERCEL_URL", "x.vercel.app");
    expect(getSiteOrigin()).toBe("https://listacerta.com.br");
  });
  it("preview usa VERCEL_URL", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "listacerta.com.br");
    vi.stubEnv("VERCEL_URL", "x-git-abc.vercel.app");
    expect(getSiteOrigin()).toBe("https://x-git-abc.vercel.app");
  });
  it("fora de produção cai na origem da requisição", () => {
    expect(getSiteOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });
  it("em produção sem configuração, erro claro (ignora a requisição)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getSiteOrigin("http://evil.test")).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
  it("sem nada e sem requisição fora de produção, erro", () => {
    expect(() => getSiteOrigin()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
