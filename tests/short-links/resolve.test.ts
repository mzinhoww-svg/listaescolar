import { describe, expect, it, vi } from "vitest";

import { encodeShortCode } from "@/features/short-links/code";
import { renderInvalidLinkHtml, resolveShortLink } from "@/features/short-links/resolve";

const school = { inep: "51000123" };

describe("resolveShortLink", () => {
  it("código válido e escola existente: 307 com Location relativo e noindex", async () => {
    const loadSchool = vi.fn().mockResolvedValue(school);
    const res = await resolveShortLink(encodeShortCode({ inep: "51000123", gradeSlug: "ef-3" }), { loadSchool });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/escolas/51000123/ef-3");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(loadSchool).toHaveBeenCalledWith("51000123");
  });

  it("código de perfil aponta para /escolas/{inep}", async () => {
    const res = await resolveShortLink(encodeShortCode({ inep: "51000123" }), { loadSchool: async () => school });
    expect(res.headers.get("location")).toBe("/escolas/51000123");
  });

  it("escola inexistente: 404 HTML com a tela de link inválido", async () => {
    const res = await resolveShortLink(encodeShortCode({ inep: "51000123" }), { loadSchool: async () => null });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const html = await res.text();
    expect(html).toContain("Link inválido ou expirado?");
    expect(html).toContain('href="/escolas"');
  });

  it("código inválido: 404 sem consultar o banco", async () => {
    const loadSchool = vi.fn();
    const res = await resolveShortLink("nao-e-codigo", { loadSchool });
    expect(res.status).toBe(404);
    expect(loadSchool).not.toHaveBeenCalled();
  });

  it("erro do banco: 503 sem vazar a mensagem", async () => {
    const loadSchool = vi.fn().mockRejectedValue(new Error("segredo do banco"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await resolveShortLink(encodeShortCode({ inep: "51000123" }), { loadSchool });
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("segredo");
  });
});

describe("renderInvalidLinkHtml", () => {
  it("texto constante, noindex e tokens inline", () => {
    const html = renderInvalidLinkHtml();
    expect(html).toBe(renderInvalidLinkHtml());
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("Busque a escola pelo nome e encontre a lista oficial.");
    expect(html).toContain("#F5F2EA");
    expect(html).not.toMatch(/<script/i);
  });
});
