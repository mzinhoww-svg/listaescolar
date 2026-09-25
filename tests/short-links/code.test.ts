import { describe, expect, it } from "vitest";

import { GRADES } from "@/features/grades/catalog";
import { SHORT_GRADE_CODES, gradeSlugFromCode } from "@/features/short-links/grade-codes";
import { encodeShortCode, parseShortCode, shortLinkTarget, shortLinkUrl } from "@/features/short-links/code";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const FROZEN = {
  "ei-maternal-1": 1,
  "ei-maternal-2": 2,
  "ei-pre-1": 3,
  "ei-pre-2": 4,
  "ef-1": 5,
  "ef-2": 6,
  "ef-3": 7,
  "ef-4": 8,
  "ef-5": 9,
  "ef-6": 10,
  "ef-7": 11,
  "ef-8": 12,
  "ef-9": 13,
  "em-1": 14,
  "em-2": 15,
  "em-3": 16,
};

describe("SHORT_GRADE_CODES (congelada)", () => {
  it("valores exatamente os congelados", () => {
    expect(SHORT_GRADE_CODES).toEqual(FROZEN);
  });
  it("cobre todos os GRADES sem repetição e sem usar 0", () => {
    const values = GRADES.map((g) => SHORT_GRADE_CODES[g.slug]);
    expect(values.every((v) => typeof v === "number" && v >= 1)).toBe(true);
    expect(new Set(values).size).toBe(GRADES.length);
    expect(Object.keys(SHORT_GRADE_CODES).sort()).toEqual(GRADES.map((g) => g.slug).sort());
  });
  it("gradeSlugFromCode inverte a tabela e devolve null fora dela", () => {
    for (const [slug, n] of Object.entries(FROZEN)) expect(gradeSlugFromCode(n)).toBe(slug);
    for (const n of [0, 17, 31, -1, 1.5, Number.NaN]) expect(gradeSlugFromCode(n)).toBeNull();
  });
});

describe("encodeShortCode / parseShortCode", () => {
  it.each(["10000000", "51000123", "99999999"])("ida e volta para o INEP %s e todas as séries", (inep) => {
    const profile = encodeShortCode({ inep });
    expect(parseShortCode(profile)).toEqual({ inep, gradeSlug: null });
    for (const slug of Object.keys(SHORT_GRADE_CODES)) {
      const code = encodeShortCode({ inep, gradeSlug: slug });
      expect(code).toHaveLength(8);
      expect([...code].every((c) => ALPHABET.includes(c))).toBe(true);
      expect(parseShortCode(code)).toEqual({ inep, gradeSlug: slug });
    }
  });

  it("recusa INEP inválido e série desconhecida na codificação", () => {
    expect(() => encodeShortCode({ inep: "1234567" })).toThrow();
    expect(() => encodeShortCode({ inep: "abcdefgh" })).toThrow();
    expect(() => encodeShortCode({ inep: "51000123", gradeSlug: "nao-existe" })).toThrow();
  });

  it("normaliza minúsculas, hífen e O/I/L", () => {
    const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" });
    const expected = { inep: "51000123", gradeSlug: "ef-1" };
    expect(parseShortCode(code.toLowerCase())).toEqual(expected);
    expect(parseShortCode(`${code.slice(0, 4)}-${code.slice(4)}`)).toEqual(expected);
    const zero = encodeShortCode({ inep: "10000000" });
    expect(parseShortCode(zero.replaceAll("0", "o"))).toEqual({ inep: "10000000", gradeSlug: null });
    const ones = encodeShortCode({ inep: "11111111", gradeSlug: "ei-maternal-1" });
    expect(parseShortCode(ones.replaceAll("1", "l"))).toEqual({ inep: "11111111", gradeSlug: "ei-maternal-1" });
    expect(parseShortCode(ones.replaceAll("1", "I"))).toEqual({ inep: "11111111", gradeSlug: "ei-maternal-1" });
  });

  it("rejeita tamanho errado, U, símbolos fora do alfabeto, vazio e não string", () => {
    const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" });
    for (const bad of [code.slice(0, 7), `${code}0`, "", "U0000000", "1234567*", "12345 67", "😀😀😀😀", null, undefined, 123, {}, []]) {
      expect(parseShortCode(bad)).toBeNull();
    }
    expect(parseShortCode("x".repeat(5000))).toBeNull();
  });

  it("qualquer troca de um símbolo é rejeitada (exceto diferença 31: 0 <-> Z)", () => {
    const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-4" });
    for (let pos = 0; pos < 8; pos++) {
      for (const sym of ALPHABET) {
        if (sym === code[pos]) continue;
        const mutated = code.slice(0, pos) + sym + code.slice(pos + 1);
        const diff31 = pos < 7 && [code[pos], sym].sort().join("") === "0Z";
        if (diff31) continue; // limitação documentada da verificação mod 31
        expect(parseShortCode(mutated), `${mutated}`).toBeNull();
      }
    }
  });

  it("transposição adjacente de símbolos distintos é rejeitada (exceto diferença 31)", () => {
    const codes = [encodeShortCode({ inep: "51000123", gradeSlug: "ef-4" }), encodeShortCode({ inep: "52394817" })];
    for (const code of codes) {
      for (let i = 0; i < 7; i++) {
        if (code[i] === code[i + 1]) continue;
        if ([code[i], code[i + 1]].sort().join("") === "0Z") continue;
        const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
        expect(parseShortCode(swapped), swapped).toBeNull();
      }
    }
  });

  it("recusa grade code fora da tabela (17..31) mesmo com verificação correta", () => {
    // 51000123 * 32 + 20 com dígito verificador recalculado por encode interno indisponível: usa o vetor manual
    const n = 51000123 * 32 + 20;
    const digits: number[] = [];
    let rest = n;
    for (let i = 0; i < 7; i++) {
      digits.unshift(rest % 32);
      rest = Math.floor(rest / 32);
    }
    const check = digits.reduce((s, v, i) => s + (i + 1) * v, 0) % 31;
    const code = [...digits, check].map((v) => ALPHABET[v]).join("");
    expect(parseShortCode(code)).toBeNull();
  });
});

describe("shortLinkTarget / shortLinkUrl", () => {
  it("monta o caminho interno só do inteiro decodificado", () => {
    expect(shortLinkTarget({ inep: "51000123", gradeSlug: null })).toBe("/escolas/51000123");
    expect(shortLinkTarget({ inep: "51000123", gradeSlug: "ef-1" })).toBe("/escolas/51000123/ef-1");
  });
  it("shortLinkUrl usa a origem informada", () => {
    expect(shortLinkUrl("ABCDEFGH", "https://listacerta.com.br")).toBe("https://listacerta.com.br/l/ABCDEFGH");
  });
});
