import { describe, expect, it, vi } from "vitest";

import { safeNextPath } from "@/features/auth/redirect";
import { buildSearchUrl, type RetailerTarget } from "@/features/cart/redirect-target";
import { buildLeadWhatsappUrl } from "@/features/leads/message";
import { encodeShortCode } from "@/features/short-links/code";
import { resolveShortLink } from "@/features/short-links/resolve";

const VECTORS = [
  "//evil.com",
  "/\\evil.com",
  "%2F%2Fevil.com",
  "%2f%2fevil.com",
  "https:evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "/ok\r\nLocation: https://evil.com",
  "/ok%0d%0aLocation:%20https://evil.com",
  "/..",
  "/../evil",
  "/.//evil.com",
  "/%2e%2e/evil",
  "／／evil.com",
  "https://listacerta.com.br@evil.com",
  "",
  " //evil.com",
];

describe("/l/[code]", () => {
  const good = encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" });
  const wrongCheck = `${good.slice(0, 7)}${good[7] === "0" ? "1" : "0"}`;
  const badCodes = [...VECTORS, good.slice(0, 7), `${good}0`, "U1234567", "1234567*", wrongCheck];

  it.each(badCodes)("código %j nunca redireciona nem consulta o banco", async (code) => {
    const loadSchool = vi.fn();
    const res = await resolveShortLink(code, { loadSchool });
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(loadSchool).not.toHaveBeenCalled();
  });

  it("um código válido só produz /escolas/<8 dígitos>[/slug] relativo", async () => {
    const res = await resolveShortLink(good, { loadSchool: async () => ({ inep: "51000123" }) });
    expect(res.headers.get("location")).toMatch(/^\/escolas\/\d{8}(\/[a-z0-9-]+)?$/);
  });
});

describe("safeNextPath (S02)", () => {
  it.each(VECTORS)("%j cai no fallback /conta", (v) => {
    expect(safeNextPath(v)).toBe("/conta");
  });
  it("caminho com @ continua na mesma origem (não é host)", () => {
    const out = safeNextPath("/@evil.com");
    expect(new URL(out, "http://app.invalid").origin).toBe("http://app.invalid");
  });
  it("aceita caminho interno legítimo", () => {
    expect(safeNextPath("/escolas/51000123?x=1")).toBe("/escolas/51000123?x=1");
  });
});

describe("buildSearchUrl (S12)", () => {
  const retailer: RetailerTarget = {
    slug: "loja",
    baseUrl: "https://www.loja.example",
    searchUrlTemplate: "https://www.loja.example/busca?q={query}",
    affiliateKind: "none",
    isActive: true,
  };
  const QUERY_VECTORS = [...VECTORS, "a&b=c#frag", "x/../../y", "..", "%0d%0a", "https://evil.com"];
  it.each(QUERY_VECTORS)("query %j nunca muda o host nem o esquema", (q) => {
    let url: URL | null = null;
    try {
      url = buildSearchUrl(retailer, q);
    } catch {
      return; // recusar é seguro
    }
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.loja.example");
    expect(url.username).toBe("");
    expect(url.pathname).toBe("/busca");
    expect(url.hash).toBe("");
  });
  it("template com host controlado pela query é recusado", () => {
    expect(() => buildSearchUrl({ ...retailer, searchUrlTemplate: "https://{query}/x" }, "evil.com")).toThrow();
  });
});

describe("wa.me (S14)", () => {
  const base = { code: "LC-5TJ1", schoolName: "Escola", gradeLabel: "1º ano", schoolYear: 2026 };
  const listUrl = "https://listacerta.example/papelaria/leads/LC-5TJ1";
  const opts = { siteOrigin: "https://listacerta.example" };
  it("gera só https://wa.me/<dígitos>?text=", () => {
    const link = buildLeadWhatsappUrl("+5565999990000", { ...base, listUrl }, opts);
    expect(link).not.toBeNull();
    const u = new URL(link as string);
    expect(u.host).toBe("wa.me");
    expect(u.protocol).toBe("https:");
    expect([...u.searchParams.keys()]).toEqual(["text"]);
  });
  it.each(["//evil.com", "https://evil.com/x", "javascript:alert(1)", "+5565999990000@evil.com", "evil.com/+5565999990000", "65 99999 8888\r\nX: y"])(
    "número %j nunca produz destino fora de wa.me",
    (number) => {
      const link = buildLeadWhatsappUrl(number, { ...base, listUrl }, opts);
      if (link !== null) expect(new URL(link).host).toBe("wa.me");
    },
  );
  it.each(["https://evil.com/papelaria/leads/LC-5TJ1", "https://listacerta.example.evil.com/papelaria/leads/LC-5TJ1", "//evil.com", "javascript:alert(1)"])(
    "link da lista %j fora do site é recusado",
    (bad) => {
      expect(buildLeadWhatsappUrl("+5565999990000", { ...base, listUrl: bad }, opts)).toBeNull();
    },
  );
});
