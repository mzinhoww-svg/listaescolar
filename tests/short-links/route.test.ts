import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadSchool = vi.fn();
vi.mock("@/features/schools/search/load-school", () => ({ loadSchool: (inep: string) => loadSchool(inep) }));

import { GET as getLink } from "@/app/l/[code]/route";
import { GET as getQr } from "@/app/l/[code]/qr/route";
import { encodeShortCode } from "@/features/short-links/code";

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const req = (path: string) => new Request(`http://evil.example${path}`);

describe("GET /l/[code]", () => {
  beforeEach(() => loadSchool.mockReset());

  it("307 relativo, sem depender de Host", async () => {
    loadSchool.mockResolvedValue({ inep: "51000123" });
    const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" });
    const res = await getLink(req(`/l/${code}`), ctx(code));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/escolas/51000123/ef-1");
  });

  it("inválido: 404 e sem consulta", async () => {
    const res = await getLink(req("/l/xx"), ctx("xx"));
    expect(res.status).toBe(404);
    expect(loadSchool).not.toHaveBeenCalled();
  });
});

describe("GET /l/[code]/qr", () => {
  const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" });
  const saved = { site: process.env.NEXT_PUBLIC_SITE_URL, vercel: process.env.VERCEL_URL, env: process.env.VERCEL_ENV };
  afterEach(() => {
    for (const [k, v] of [["NEXT_PUBLIC_SITE_URL", saved.site], ["VERCEL_URL", saved.vercel], ["VERCEL_ENV", saved.env]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("válido: image/svg+xml", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
    const res = await getQr(req(`/l/${code}/qr`), ctx(code));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(await res.text()).toContain("<svg");
  });

  it("?download=1 traz Content-Disposition com o código", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
    const res = await getQr(req(`/l/${code}/qr?download=1`), ctx(code));
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="listacerta-${code}.svg"`);
  });

  it("download com valor estranho é ignorado", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
    const res = await getQr(req(`/l/${code}/qr?download=../../x`), ctx(code));
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("código inválido: 404", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
    expect((await getQr(req("/l/zz/qr"), ctx("zz"))).status).toBe(404);
  });

  it("sem origem configurada: 503 (nunca usa o Host da requisição)", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    const res = await getQr(req(`/l/${code}/qr`), ctx(code));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("evil.example");
  });
});
