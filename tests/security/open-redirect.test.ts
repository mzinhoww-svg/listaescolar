import { describe, expect, it, vi } from "vitest";

import { safeNextPath } from "@/features/auth/redirect";
import { buildSearchUrl, type RetailerTarget } from "@/features/cart/redirect-target";
import { buildLeadWhatsappUrl } from "@/features/leads/message";
import { encodeShortCode } from "@/features/short-links/code";
import { SHORT_GRADE_CODES } from "@/features/short-links/grade-codes";
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

  /** PRNG determinístico (mulberry32): a propriedade roda sobre muitas entradas e falha de forma reproduzível. */
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("propriedade: para INEP/série válidos aleatórios, Location casa ^/escolas/\\d{8}(/slug)?$ e a série é a pedida", async () => {
    const rand = rng(27);
    const slugs = Object.keys(SHORT_GRADE_CODES);
    for (let i = 0; i < 300; i++) {
      const inep = String(Math.floor(rand() * 100_000_000)).padStart(8, "0");
      const gradeSlug = rand() < 0.2 ? null : (slugs[Math.floor(rand() * slugs.length)] as string);
      const code = encodeShortCode({ inep, gradeSlug });
      const res = await resolveShortLink(code, { loadSchool: async (i2) => ({ inep: i2 }) });
      const location = res.headers.get("location") as string;
      expect(location).toMatch(/^\/escolas\/\d{8}(\/[a-z0-9-]+)?$/);
      expect(location).toBe(gradeSlug === null ? `/escolas/${inep}` : `/escolas/${inep}/${gradeSlug}`);
    }
  });

  it("propriedade: entradas aleatórias com comprimento != 8 símbolos são 404 sem Location", async () => {
    const rand = rng(28);
    const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZabc/\\.%-:@";
    for (let i = 0; i < 300; i++) {
      let len = Math.floor(rand() * 40);
      if (len === 8) len = 9;
      const code = Array.from({ length: len }, () => chars[Math.floor(rand() * chars.length)]).join("");
      const res = await resolveShortLink(code, { loadSchool: async (i2) => ({ inep: i2 }) });
      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull();
    }
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
