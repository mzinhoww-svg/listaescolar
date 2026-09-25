// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  mapNetwork,
  normalizeCep,
  normalizeEmail,
  normalizeInep,
  normalizeName,
  normalizePhone,
} from "@/features/schools/normalize";

describe("normalizeName", () => {
  const cases: [string, string][] = [
    ["Escola Demonstração 1", "escola demonstracao 1"],
    ["ESCOLA DEMONSTRAÇÃO 1", "escola demonstracao 1"],
    ["  Escola   Municipal   São  José  ", "escola municipal sao jose"],
    ["Colégio São José!", "colegio sao jose"],
    ["E.M. Prof. José da Silva", "escola municipal professor jose da silva"],
    ["E. M. Profª. Ana", "escola municipal professora ana"],
    ["E.E. Cel. Pedro", "escola estadual coronel pedro"],
    ["E.M.E.B. Santa Rita", "escola municipal de educacao basica santa rita"],
    ["Esc. Mun. Cecília Meireles", "escola municipal cecilia meireles"],
    ["ESC Prof Maria", "escola professor maria"],
    ["Escola D'Ávila-Neto", "escola d avila neto"],
    ["Escola Ação e Vida", "escola acao e vida"],
    ["", ""],
    ["   ", ""],
    ["!!!", ""],
  ];
  it.each(cases)("%j -> %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
  it("é determinística e idempotente", () => {
    const once = normalizeName("E.M. Prof. José");
    expect(normalizeName(once)).toBe(once);
    expect(normalizeName("E.M. Prof. José")).toBe(once);
  });
  it("abreviada e por extenso convergem", () => {
    expect(normalizeName("E.M. Prof. José")).toBe(normalizeName("Escola Municipal Professor José"));
  });
});

describe("demais normalizações", () => {
  it("normalizeInep mantém só dígitos", () => {
    expect(normalizeInep(" 51.000.001 ")).toBe("51000001");
    expect(normalizeInep("abc")).toBe("");
    expect(normalizeInep("")).toBe("");
  });
  it("normalizePhone junta DDD e número", () => {
    expect(normalizePhone("65", "3333-0001")).toBe("6533330001");
    expect(normalizePhone("(65)", "99999-0003")).toBe("65999990003");
    expect(normalizePhone("", "33330001")).toBeNull();
    expect(normalizePhone("65", "")).toBeNull();
    expect(normalizePhone("65", "123")).toBeNull();
  });
  it("normalizeCep", () => {
    expect(normalizeCep("78000-000")).toBe("78000000");
    expect(normalizeCep("1310100")).toBe("01310100");
    expect(normalizeCep("123")).toBeNull();
    expect(normalizeCep("")).toBeNull();
  });
  it("normalizeEmail", () => {
    expect(normalizeEmail("  Escola@Exemplo.INVALID ")).toBe("escola@exemplo.invalid");
    expect(normalizeEmail("nao-e-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
  it("mapNetwork", () => {
    expect(mapNetwork("1")).toBe("federal");
    expect(mapNetwork("2")).toBe("state");
    expect(mapNetwork("3")).toBe("municipal");
    expect(mapNetwork("4")).toBe("private");
    expect(mapNetwork(" 03 ")).toBe("municipal");
    expect(mapNetwork("9")).toBeNull();
    expect(mapNetwork("")).toBeNull();
  });
});
