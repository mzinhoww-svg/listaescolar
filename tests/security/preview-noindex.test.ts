import { describe, expect, it } from "vitest";

import { NOINDEX_VALUE, robotsHeaders } from "@/lib/robots-header";

describe("X-Robots-Tag fora da produção", () => {
  it.each([["preview"], ["development"], [undefined], [""]])("VERCEL_ENV=%s recebe noindex em todas as rotas", (env) => {
    const h = robotsHeaders({ VERCEL_ENV: env });
    expect(h).toHaveLength(1);
    expect(h[0]?.source).toBe("/:path*");
    expect(h[0]?.headers).toEqual([{ key: "X-Robots-Tag", value: NOINDEX_VALUE }]);
    expect(NOINDEX_VALUE).toMatch(/noindex/);
    expect(NOINDEX_VALUE).toMatch(/nofollow/);
  });

  it("produção da Vercel SEM SITE_INDEXING=1 também recebe noindex (o deploy de produção aponta para o staging)", () => {
    for (const idx of [undefined, "", "0", "true", "yes"]) {
      const h = robotsHeaders({ VERCEL_ENV: "production", SITE_INDEXING: idx });
      expect(h[0]?.headers[0]?.value, String(idx)).toBe(NOINDEX_VALUE);
    }
  });

  it("produção da Vercel COM SITE_INDEXING=1 (go-live) não recebe o cabeçalho (o robots.ts decide)", () => {
    expect(robotsHeaders({ VERCEL_ENV: "production", SITE_INDEXING: "1" })).toEqual([]);
  });

  it("SITE_INDEXING=1 fora da produção não libera nada", () => {
    expect(robotsHeaders({ VERCEL_ENV: "preview", SITE_INDEXING: "1" })).toHaveLength(1);
    expect(robotsHeaders({ SITE_INDEXING: "1" })).toHaveLength(1);
  });

  it("next.config.ts liga a função ao Next (headers) com VERCEL_ENV real", async () => {
    const { default: cfg } = await import("../../next.config");
    expect(typeof cfg.headers).toBe("function");
    const original = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = "preview";
      const h = await cfg.headers!();
      expect(h[0]?.headers[0]?.key).toBe("X-Robots-Tag");
      process.env.VERCEL_ENV = "production";
      delete process.env.SITE_INDEXING;
      expect((await cfg.headers!())[0]?.headers[0]?.key).toBe("X-Robots-Tag");
      process.env.SITE_INDEXING = "1";
      expect(await cfg.headers!()).toEqual([]);
    } finally {
      if (original === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = original;
      delete process.env.SITE_INDEXING;
    }
  });
});
