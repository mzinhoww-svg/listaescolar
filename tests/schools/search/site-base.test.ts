import { afterEach, describe, expect, it, vi } from "vitest";

import { siteBase } from "@/lib/site-base";

afterEach(() => vi.unstubAllEnvs());

function env(vars: Record<string, string>) {
  for (const k of ["NEXT_PUBLIC_SITE_URL", "VERCEL_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(k, vars[k] ?? "");
}

describe("siteBase", () => {
  it("usa a origem configurada", () => {
    env({ NEXT_PUBLIC_SITE_URL: "https://listacerta.com.br/x" });
    expect(siteBase()).toBe("https://listacerta.com.br");
  });

  it("fora de deploy sem origem: localhost (E2E local)", () => {
    env({});
    expect(siteBase()).toBe("http://localhost:3000");
  });

  it("em deploy (VERCEL_ENV) sem origem válida: null, nunca localhost", () => {
    env({ VERCEL_ENV: "production" });
    expect(siteBase()).toBeNull();
    env({ VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "não é url" });
    expect(siteBase()).toBeNull();
  });

  it("em deploy com VERCEL_URL usa o host da Vercel", () => {
    env({ VERCEL_ENV: "preview", VERCEL_URL: "listaescolar-abc.vercel.app" });
    expect(siteBase()).toBe("https://listaescolar-abc.vercel.app");
  });
});
