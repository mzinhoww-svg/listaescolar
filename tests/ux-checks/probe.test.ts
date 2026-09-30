import { describe, it, expect } from "vitest";
import { classifyHiddenActions, classifyTargets } from "@/lib/ux-checks";

describe("ação escondida por tabela larga (390 px)", () => {
  it("acusa a ação fora da área visível do contêiner de rolagem", () => {
    const r = classifyHiddenActions([{ label: "Aprovar", left: 420, right: 500, clipRight: 390, inTable: true }]);
    expect(r).toEqual(["Aprovar (fora da tela, x=420 de 390)"]);
  });
  it("acusa a ação cortada em mais da metade", () => {
    expect(classifyHiddenActions([{ label: "Gerir", left: 350, right: 450, clipRight: 390, inTable: true }])).toHaveLength(1);
  });
  it("aceita ação inteira ou só encostada na borda", () => {
    expect(classifyHiddenActions([{ label: "Abrir", left: 300, right: 391, clipRight: 390, inTable: true }])).toEqual([]);
    expect(classifyHiddenActions([{ label: "Abrir", left: 10, right: 100, clipRight: 390, inTable: false }])).toEqual([]);
  });
  it("ignora entrada sem largura", () => {
    expect(classifyHiddenActions([{ label: "x", left: 500, right: 500, clipRight: 390, inTable: true }])).toEqual([]);
  });
});

describe("alvos de toque com a regra da S29", () => {
  it("abaixo de 24 px = P1; de 24 a 43 px = P2; 44 px passa", () => {
    const r = classifyTargets([
      { label: "a.Gerir", w: 34, h: 18 },
      { label: "a.Ver", w: 60, h: 30 },
      { label: "button.Ok", w: 44, h: 44 },
      { label: "button.Ok2", w: 43.6, h: 44 },
    ]);
    expect(r.p1).toEqual(["a.Gerir 34x18"]);
    expect(r.p2).toEqual(["a.Ver 60x30"]);
  });
  it("resume com contagem por severidade", () => {
    const r = classifyTargets([{ label: "a", w: 10, h: 10 }, { label: "b", w: 30, h: 30 }]);
    expect(r.summary).toBe("P1: 1, P2: 1");
  });
  it("sem alvo pequeno, resumo vazio", () => {
    expect(classifyTargets([]).summary).toBe("");
  });
});
