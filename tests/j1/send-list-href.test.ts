import { describe, expect, it } from "vitest";

import { parseSendListPrefill, sendListHref } from "@/features/submissions/href";

describe("sendListHref (UX-012)", () => {
  it("sem contexto leva ao formulário puro", () => {
    expect(sendListHref()).toBe("/enviar-lista");
  });

  it("com escola, série e ano leva os três", () => {
    expect(sendListHref({ inep: "99029001", gradeSlug: "ef-3", year: 2027 })).toBe("/enviar-lista?escola=99029001&serie=ef-3&ano=2027");
  });

  it("só a escola também vale", () => {
    expect(sendListHref({ inep: "99029001" })).toBe("/enviar-lista?escola=99029001");
  });
});

describe("parseSendListPrefill (UX-012)", () => {
  it("aceita INEP de 8 dígitos, série do catálogo e ano de 4 dígitos", () => {
    expect(parseSendListPrefill({ escola: "99029001", serie: "ef-3", ano: "2027" })).toEqual({ inep: "99029001", gradeSlug: "ef-3", year: 2027 });
  });

  it("descarta lixo sem quebrar", () => {
    expect(parseSendListPrefill({ escola: "abc", serie: "xx-9", ano: "9999999" })).toEqual({});
    expect(parseSendListPrefill({ escola: ["99029001", "1"], serie: undefined, ano: undefined })).toEqual({ inep: "99029001" });
  });
});

import { seriesValueForSlug } from "@/components/submissions/series-options";

describe("seriesValueForSlug (UX-012)", () => {
  it("converte o slug do catálogo no valor do seletor de /enviar-lista", () => {
    expect(seriesValueForSlug("ef-5")).toBe("5º ano");
    expect(seriesValueForSlug("em-1")).toBe("1ª série do ensino médio");
    expect(seriesValueForSlug("ei-pre-2")).toBe("Educação infantil");
    expect(seriesValueForSlug("zz-1")).toBeUndefined();
  });
});
