import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
vi.mock("@/features/schools/search/sitemap", async (orig) => ({
  ...(await orig<typeof import("@/features/schools/search/sitemap")>()),
  listIndexableSchools: (...a: unknown[]) => listMock(...a),
}));

describe("app/sitemap", () => {
  const saved = { site: process.env.NEXT_PUBLIC_SITE_URL, vercel: process.env.VERCEL_ENV, url: process.env.VERCEL_URL };
  beforeEach(() => {
    listMock.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
  });
  afterEach(() => {
    for (const [k, v] of [["NEXT_PUBLIC_SITE_URL", saved.site], ["VERCEL_ENV", saved.vercel], ["VERCEL_URL", saved.url]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("estáticas + escolas indexáveis, URLs absolutas, sem /l/ nem listas nem papelarias", async () => {
    listMock.mockResolvedValue([{ inep: "51000002", updatedAt: "2026-01-02T00:00:00Z" }]);
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of ["/", "/como-funciona", "/sobre", "/termos", "/privacidade", "/escolas"]) {
      expect(urls).toContain(`https://listacerta.example${path}`);
    }
    expect(urls).toContain("https://listacerta.example/escolas/51000002");
    expect(urls.every((u) => u.startsWith("https://listacerta.example/"))).toBe(true);
    expect(urls.some((u) => /\/l\/|papelaria|\/escolas\/\d{8}\/|\/conta|\/admin/.test(u))).toBe(false);
  });

  it("sem base (deploy sem origem) devolve []", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    process.env.VERCEL_ENV = "production";
    const { default: sitemap } = await import("@/app/sitemap");
    expect(await sitemap()).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("erro do banco: só as estáticas", async () => {
    listMock.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    spy.mockRestore();
    expect(urls).toHaveLength(6);
    expect(urls.some((u) => /\/escolas\/\d/.test(u))).toBe(false);
  });
});
