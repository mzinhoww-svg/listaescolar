import { describe, expect, it } from "vitest";

import {
  buildErrorReportCsv,
  describeError,
  describeErrorCode,
  neutralizeCell,
  safeReportFileName,
} from "@/features/schools/error-report";
import type { ErrorRow } from "@/features/schools/ports";

describe("neutralizeCell", () => {
  it.each(["=1+1", "+cmd", "-2", "@SUM(A1)", "\tx", "\rx"])("prefixa %j", (v) => {
    expect(neutralizeCell(v)).toBe(`'${v}`);
  });
  it("mantém texto comum", () => {
    expect(neutralizeCell("Escola A")).toBe("Escola A");
    expect(neutralizeCell("")).toBe("");
  });
});

describe("describeErrorCode / describeError", () => {
  it("traduz códigos conhecidos e mostra o cru para desconhecidos", () => {
    expect(describeErrorCode("demo_real_conflict")).toMatch(/demonstração/i);
    expect(describeErrorCode("codigo_novo")).toBe("codigo_novo");
    expect(describeError({ code: "codigo_novo", message: "algo" })).toBe("codigo_novo: algo");
    expect(describeError({ code: "field_too_long", message: "x" })).toMatch(/tamanho/);
  });
});

describe("buildErrorReportCsv", () => {
  const rows: ErrorRow[] = [
    { rowNumber: 3, action: "rejected", errors: [{ code: "invalid_inep", message: "m" }], raw: { CO_ENTIDADE: "123", NO_ENTIDADE: "=HYPERLINK(\"x\")" } },
    { rowNumber: 5, action: "duplicate", errors: [{ code: "a", message: "b;c" }, { code: "d", message: "" }], raw: null },
  ];
  const csv = buildErrorReportCsv(rows);
  const lines = csv.replace("﻿", "").trim().split("\r\n");

  it("tem BOM, cabeçalho e uma linha por erro", () => {
    expect(csv.startsWith("﻿linha;situacao;codigo;mensagem;CO_ENTIDADE")).toBe(true);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("3;Rejeitada;invalid_inep;INEP inválido (8 dígitos).;123;");
  });
  it("neutraliza fórmulas e escapa aspas e separadores", () => {
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain('"a: b;c"');
  });
  it("sem linhas gera só o cabeçalho", () => {
    expect(buildErrorReportCsv([]).trim().split("\r\n")).toHaveLength(1);
  });
});

describe("safeReportFileName", () => {
  it("remove caracteres perigosos", () => {
    expect(safeReportFileName('a"b\r\nc/../d')).toBe("erros-importacao-abcd.csv");
  });
});
