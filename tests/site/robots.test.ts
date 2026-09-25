import { afterEach, describe, expect, it } from "vitest";

import robots from "@/app/robots";
import { PREFIXES } from "@/features/auth/access";

const saved = { site: process.env.NEXT_PUBLIC_SITE_URL, env: process.env.VERCEL_ENV, url: process.env.VERCEL_URL };
afterEach(() => {
  for (const [k, v] of [["NEXT_PUBLIC_SITE_URL", saved.site], ["VERCEL_ENV", saved.env], ["VERCEL_URL", saved.url]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function rule() {
  const r = robots().rules;
  const first = Array.isArray(r) ? r[0] : r;
  if (!first) throw new Error("sem regra");
  return first;
}

describe("robots", () => {
  it("produção: libera / e bloqueia cada prefixo privado sem tocar em /escolas", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
    const disallow = [rule().disallow].flat();
    expect(rule().allow).toBe("/");
    for (const p of PREFIXES) expect(disallow).toContain(`${p}/`);
    for (const extra of ["/auth/", "/api/", "/l/", "/cadastrar-papelaria", "/403"]) expect(disallow).toContain(extra);
    // "/escola/" não é prefixo de "/escolas/", e nada bloqueia as páginas públicas noindex.
    expect(disallow.some((d) => "/escolas/51000123/ef-1".startsWith(d as string))).toBe(false);
    expect(disallow.some((d) => "/papelarias".startsWith(d as string))).toBe(false);
    expect(robots().sitemap).toBe("https://listacerta.example/sitemap.xml");
  });

  it("preview e local: disallow /", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
    process.env.VERCEL_ENV = "preview";
    expect(rule().disallow).toBe("/");
    delete process.env.VERCEL_ENV;
    expect(rule().disallow).toBe("/");
    expect(robots().sitemap).toBeUndefined();
  });

  it("produção sem base válida: disallow /", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(rule().disallow).toBe("/");
  });
});
