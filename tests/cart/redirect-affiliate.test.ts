import { describe, expect, it } from "vitest";

import { buildRetailerRedirect, createAffiliateLinkBuilder } from "@/features/cart/affiliate";
import {
  buildSearchUrl,
  MAX_QUERY_LENGTH,
  RedirectTargetError,
  sanitizeQuery,
  type RetailerTarget,
} from "@/features/cart/redirect-target";

const R = (over: Partial<RetailerTarget> = {}): RetailerTarget => ({
  slug: "kalunga",
  baseUrl: "https://www.kalunga.com.br",
  searchUrlTemplate: "https://www.kalunga.com.br/busca/{query}",
  affiliateKind: "none",
  isActive: true,
  ...over,
});
const ML = R({
  slug: "mercadolivre",
  baseUrl: "https://www.mercadolivre.com.br",
  searchUrlTemplate: "https://lista.mercadolivre.com.br/{query}",
  affiliateKind: "mercadolivre",
});
const AMZ = R({
  slug: "amazon",
  baseUrl: "https://www.amazon.com.br",
  searchUrlTemplate: "https://www.amazon.com.br/s?k={query}",
  affiliateKind: "amazon",
});

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof RedirectTargetError ? e.code : `outro:${String(e)}`;
  }
  return undefined;
};

describe("destino do redirect", () => {
  const nasty = [
    ["&", "a&b=c"],
    ["#", "a#frag"],
    ["//", "//evil.com/x"],
    ["barra e https", "https://evil.com/"],
    ["?", "a?b"],
    ["CRLF", "caderno\r\nLocation: https://evil.com"],
    ["unicode", "lápis 日本語 😀"],
    ["percent", "100%25 %0d%0a"],
    ["aspas", `"><script>alert(1)</script>`],
  ] as const;

  for (const [label, query] of nasty) {
    it(`query com ${label} fica confinada ao lugar do {query}`, () => {
      for (const r of [R(), ML, AMZ]) {
        const url = buildSearchUrl(r, query);
        const template = new URL(r.searchUrlTemplate.replace("{query}", "x"));
        expect(url.origin).toBe(template.origin);
        expect(url.hostname.endsWith(new URL(r.baseUrl).hostname.replace(/^www\./, ""))).toBe(true);
        expect(url.hash).toBe("");
        expect(url.href).not.toMatch(/[\r\n\s]/);
        expect(url.username + url.password).toBe("");
      }
      // Nos templates com "?k=", a query inteira é um único parâmetro.
      const amz = buildSearchUrl(AMZ, query);
      expect([...amz.searchParams.keys()]).toEqual(["k"]);
    });
  }

  it("preserva a busca legítima (round trip)", () => {
    const url = buildSearchUrl(AMZ, "lápis & caderno #2");
    expect(url.searchParams.get("k")).toBe("lápis & caderno #2");
    expect(url.href).toBe("https://www.amazon.com.br/s?k=l%C3%A1pis%20%26%20caderno%20%232");
  });

  it("CRLF e controles viram espaço; nada de quebra de linha na URL", () => {
    expect(sanitizeQuery("a\r\nb\tc\u0000d")).toBe("a b c d");
    expect(buildSearchUrl(R(), "a\r\nb").href).toBe("https://www.kalunga.com.br/busca/a%20b");
  });

  it("query enorme é truncada por code point", () => {
    const emoji = "😀".repeat(MAX_QUERY_LENGTH * 3);
    expect(Array.from(sanitizeQuery(emoji))).toHaveLength(MAX_QUERY_LENGTH);
    expect(buildSearchUrl(R(), "a".repeat(100_000)).href.length).toBeLessThan(300);
  });

  it("query '.' ou '..' é recusada (não vira segmento de caminho)", () => {
    for (const q of [".", "..", " . ", "\n..\t"]) {
      expect(codeOf(() => buildSearchUrl(R(), q))).toBe("unsafe_target");
    }
    expect(buildSearchUrl(R(), "a.b").pathname).toBe("/busca/a.b");
    expect(buildSearchUrl(R(), "...").pathname).toBe("/busca/...");
  });

  it("query vazia ou só controles é recusada", () => {
    expect(codeOf(() => buildSearchUrl(R(), "   \r\n "))).toBe("empty_query");
  });

  it("retailer inativo é recusado", () => {
    expect(codeOf(() => buildSearchUrl(R({ isActive: false }), "x"))).toBe("inactive_retailer");
  });

  it("template inseguro é recusado (http, host trocado, sem/duplo {query}, credenciais, host fora do domínio)", () => {
    const bad = [
      "http://www.kalunga.com.br/busca/{query}",
      "https://{query}.kalunga.com.br/",
      "https://evil.com/busca/{query}",
      "https://www.kalunga.com.br/busca/",
      "https://www.kalunga.com.br/{query}/{query}",
      "https://user:pw@www.kalunga.com.br/busca/{query}",
      "https://www.kalunga.com.br.evil.com/{query}",
    ];
    for (const searchUrlTemplate of bad)
      expect(
        codeOf(() => buildSearchUrl(R({ searchUrlTemplate }), "x")),
        searchUrlTemplate,
      ).toBe("unsafe_target");
  });
});

describe("afiliados", () => {
  it("sem ID: URL simples e sem selo", () => {
    for (const r of [ML, AMZ, R()]) {
      const out = buildRetailerRedirect(r, "caderno", {});
      expect(out.affiliateApplied).toBe(false);
      expect(out.url).not.toMatch(/tag=|matt_/);
    }
  });

  it("ID vazio, em branco ou com caracteres inválidos não conta como afiliado", () => {
    for (const bad of ["", "   ", "a&b=c", "id com espaço", "x".repeat(65)]) {
      expect(buildRetailerRedirect(AMZ, "x", { AMAZON_ASSOCIATE_TAG: bad }).affiliateApplied).toBe(
        false,
      );
      expect(buildRetailerRedirect(ML, "x", { MELI_AFFILIATE_ID: bad }).affiliateApplied).toBe(
        false,
      );
    }
  });

  it("Amazon com tag: parâmetro tag e selo", () => {
    const out = buildRetailerRedirect(AMZ, "caderno", { AMAZON_ASSOCIATE_TAG: "listacerta-20" });
    expect(out).toEqual({
      url: "https://www.amazon.com.br/s?k=caderno&tag=listacerta-20",
      affiliateApplied: true,
    });
  });

  it("Mercado Livre com ID: matt_tool = ID e sem matt_word quando não há palavra", () => {
    const out = buildRetailerRedirect(ML, "caderno", { MELI_AFFILIATE_ID: "abc123" });
    expect(out).toEqual({
      url: "https://lista.mercadolivre.com.br/caderno?matt_tool=abc123",
      affiliateApplied: true,
    });
  });

  it("Mercado Livre com ID e palavra: matt_tool e matt_word; palavra inválida é omitida", () => {
    const env = { MELI_AFFILIATE_ID: "abc123", MELI_AFFILIATE_WORD: "listacerta" };
    expect(buildRetailerRedirect(ML, "caderno", env)).toEqual({
      url: "https://lista.mercadolivre.com.br/caderno?matt_tool=abc123&matt_word=listacerta",
      affiliateApplied: true,
    });
    const bad = buildRetailerRedirect(ML, "caderno", { ...env, MELI_AFFILIATE_WORD: "a&b" });
    expect(bad.url).toBe("https://lista.mercadolivre.com.br/caderno?matt_tool=abc123");
  });

  it("palavra sem ID não aplica afiliado", () => {
    const out = buildRetailerRedirect(ML, "caderno", { MELI_AFFILIATE_WORD: "listacerta" });
    expect(out).toEqual({
      url: "https://lista.mercadolivre.com.br/caderno",
      affiliateApplied: false,
    });
  });

  it("ID de um programa não vaza para outro varejista", () => {
    const env = { MELI_AFFILIATE_ID: "abc", AMAZON_ASSOCIATE_TAG: "tag-20" };
    expect(buildRetailerRedirect(R(), "x", env)).toEqual({
      url: "https://www.kalunga.com.br/busca/x",
      affiliateApplied: false,
    });
    expect(
      buildRetailerRedirect(ML, "x", { AMAZON_ASSOCIATE_TAG: "tag-20" }).affiliateApplied,
    ).toBe(false);
  });

  it("retailer desconhecido (null) e inativo são recusados", () => {
    const builder = createAffiliateLinkBuilder({});
    expect(codeOf(() => builder.build(null, "x"))).toBe("unknown_retailer");
    expect(codeOf(() => builder.build(R({ isActive: false }), "x"))).toBe("inactive_retailer");
  });

  it("a query nunca injeta parâmetro de afiliado próprio", () => {
    const out = buildRetailerRedirect(AMZ, "x&tag=evil-20", {
      AMAZON_ASSOCIATE_TAG: "listacerta-20",
    });
    expect(new URL(out.url).searchParams.getAll("tag")).toEqual(["listacerta-20"]);
  });
});
