import { describe, expect, it, vi } from "vitest";

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

describe("next.config", () => {
  it("não há rewrite para /ingest (o proxy é Route Handler que repassa só content-type)", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_x");
    vi.stubEnv("SENTRY_DSN", "");
    const cfg = (await import("../../next.config")).default;
    expect(cfg.rewrites).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
