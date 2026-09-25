import { describe, expect, it } from "vitest";

import { parseSearchParams } from "@/features/schools/search/params";
import { buildSearchQuery } from "@/features/schools/search/query";

const UUID = "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b";

describe("parseSearchParams", () => {
  const cases: [string, Record<string, string | string[] | undefined>, Partial<ReturnType<typeof parseSearchParams>>][] = [
    ["vazio", {}, { q: null, qNormalized: null, qTooShort: false, network: null, neighborhood: null, municipalityId: null, page: 1, inep: null }],
    ["q normaliza e expande abreviação", { q: "  EMEB   Prof.  José  " }, { q: "EMEB Prof. José", qNormalized: "escola municipal de educacao basica professor jose" }],
    ["q array usa o primeiro", { q: ["objetivo", "outro"] }, { q: "objetivo", qNormalized: "objetivo" }],
    ["q array vazio", { q: [] }, { q: null, qTooShort: false }],
    ["q vazio (form GET)", { q: "" }, { q: null, qTooShort: false }],
    ["bairro vazio (form GET)", { bairro: "" }, { neighborhood: null }],
    ["q só espaços", { q: "     " }, { q: null, qTooShort: false }],
    ["q '%' é curto demais", { q: "%" }, { q: null, qTooShort: true }],
    ["q '_'", { q: "_" }, { q: null, qTooShort: true }],
    ["q barra invertida", { q: "\\" }, { q: null, qTooShort: true }],
    ["q uma letra", { q: "a" }, { q: null, qTooShort: true }],
    ["q '%_\\' com texto", { q: "100% _ño\\" }, { qNormalized: "100 no" }],
    ["q aspas e SQL", { q: "'; drop table schools;--" }, { qNormalized: "drop table schools" }],
    ["q emoji só", { q: "😀😀" }, { q: null, qTooShort: true }],
    ["q INEP de 8 dígitos", { q: "51001234" }, { inep: "51001234", q: "51001234" }],
    ["q 7 dígitos não é INEP", { q: "5100123" }, { inep: null }],
    ["rede válida mapeada", { rede: "estadual" }, { network: "state" }],
    ["rede privada", { rede: "PRIVADA" }, { network: "private" }],
    ["rede inválida", { rede: "xyz" }, { network: null }],
    ["rede do prototype", { rede: "constructor" }, { network: null }],
    ["rede em array", { rede: ["municipal", "x"] }, { network: "municipal" }],
    ["pagina válida", { pagina: "3" }, { page: 3 }],
    ["pagina -1", { pagina: "-1" }, { page: 1 }],
    ["pagina abc", { pagina: "abc" }, { page: 1 }],
    ["pagina 0", { pagina: "0" }, { page: 1 }],
    ["pagina 501", { pagina: "501" }, { page: 1 }],
    ["pagina 500", { pagina: "500" }, { page: 500 }],
    ["pagina decimal", { pagina: "1.5" }, { page: 1 }],
    ["pagina vazia", { pagina: "" }, { page: 1 }],
    ["pagina 1e2", { pagina: "1e2" }, { page: 1 }],
    ["pagina +5", { pagina: "+5" }, { page: 1 }],
    ["pagina 1000", { pagina: "1000" }, { page: 1 }],
    ["pagina hex", { pagina: "0x10" }, { page: 1 }],
    ["municipio uuid", { municipio: UUID.toUpperCase() }, { municipalityId: UUID }],
    ["municipio inválido", { municipio: "não-é-uuid" }, { municipalityId: null }],
    ["municipio injeção", { municipio: `${UUID}' or 1=1` }, { municipalityId: null }],
    ["bairro normal", { bairro: "  Centro   Sul " }, { neighborhood: "Centro Sul" }],
    ["bairro curto", { bairro: "%" }, { neighborhood: null }],
  ];
  it.each(cases)("%s", (_n, raw, expected) => {
    expect(parseSearchParams(raw)).toMatchObject(expected);
  });

  it("q de 10 mil caracteres é truncada em 100 e não lança", () => {
    const r = parseSearchParams({ q: "escola ".repeat(1500) });
    expect(r.q?.length).toBeLessThanOrEqual(100);
    expect(r.qNormalized?.length).toBeLessThanOrEqual(100);
  });

  it("qNormalized é cortado em 100 depois da expansão de abreviações", () => {
    const r = parseSearchParams({ q: "emeb ".repeat(19) });
    expect(r.qNormalized?.length).toBeLessThanOrEqual(100);
    expect(r.qNormalized).toBe(r.qNormalized?.trim());
  });

  it("hasRawParams reflete qualquer parâmetro de busca cru", () => {
    expect(parseSearchParams({}).hasRawParams).toBe(false);
    expect(parseSearchParams({ utm: "x" }).hasRawParams).toBe(false);
    for (const raw of [{ q: "a" }, { pagina: "abc" }, { rede: "xyz" }, { bairro: "" }, { municipio: "x" }]) {
      expect(parseSearchParams(raw).hasRawParams).toBe(true);
    }
  });

  it("bairro gigante é truncado", () => {
    expect(parseSearchParams({ bairro: "centro ".repeat(2000) }).neighborhood?.length).toBeLessThanOrEqual(100);
  });

  it("nunca lança com valores não string", () => {
    const hostile = { q: 5, rede: {}, pagina: null, municipio: [{}] } as unknown as Record<string, string>;
    expect(() => parseSearchParams(hostile)).not.toThrow();
    expect(parseSearchParams(hostile).page).toBe(1);
  });
});

describe("buildSearchQuery", () => {
  it("omite padrões e reconstrói filtros", () => {
    expect(buildSearchQuery(parseSearchParams({}))).toBe("");
    const input = parseSearchParams({ q: "objetivo", rede: "privada", pagina: "2", municipio: UUID });
    expect(buildSearchQuery(input)).toBe(`?q=objetivo&rede=privada&municipio=${UUID}&pagina=2`);
    expect(buildSearchQuery(input, { page: 1 })).not.toContain("pagina");
  });
});
