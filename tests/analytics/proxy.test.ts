import { afterEach, describe, expect, it, vi } from "vitest";

import { config as proxyConfig } from "@/proxy";

/** O matcher do Next é uma regex sobre o caminho; reproduzimos a regra para provar quem fica fora da sessão. */
const matches = (path: string) => new RegExp(`^${proxyConfig.matcher[0]!.replace(/\(\?!/, "(?!")}$`).test(path);

describe("proxy.ts e /ingest", () => {
  it("o proxy de medição fica fora da sessão do app; o resto continua dentro", () => {
    expect(matches("/ingest/i/v0/e")).toBe(false);
    expect(matches("/ingest/batch")).toBe(false);
    expect(matches("/escolas")).toBe(true);
    expect(matches("/admin")).toBe(true);
    expect(matches("/ingestao")).toBe(true);
  });
});

describe("rewrites do next.config", () => {
  async function load(env: Record<string, string>) {
    vi.resetModules();
    for (const k of ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST", "SENTRY_DSN"]) vi.stubEnv(k, env[k] ?? "");
    const mod = await import("../../next.config");
    return mod.default;
  }
  afterEach(() => vi.unstubAllEnvs());

  it("sem chave: nenhum rewrite (proxy inexistente)", async () => {
    const cfg = await load({});
    expect(await cfg.rewrites?.()).toEqual([]);
  });

  it("com chave: /ingest/:path* vai para o host configurado", async () => {
    const cfg = await load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" });
    expect(await cfg.rewrites?.()).toEqual([{ source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" }]);
  });
});
