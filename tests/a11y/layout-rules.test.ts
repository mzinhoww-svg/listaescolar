import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const grep = (pattern: string): string =>
  execSync(`grep -rnE ${JSON.stringify(pattern)} app components features || true`, { cwd: process.cwd() }).toString().trim();

/** S28 Task 20 (D-01, D-03, D-06): regras de DESIGN.md vigiadas no código; o resto é medido por `scripts/s28-medir.mjs` (checks.md). */
describe("regras de layout do DESIGN.md", () => {
  it("nenhum texto abaixo de 12 px", () => {
    expect(grep(String.raw`text-\[(9|10|11)(\.[0-9]+)?px\]`)).toBe("");
  });

  it("botões e links de ação não usam altura fixa abaixo de 44 px", () => {
    expect(grep(String.raw`<(button|Link)[^>]*className="[^"]*\bh-(8|9|10)\b`)).toBe("");
  });

  it("todo contêiner de tabela com rolagem lateral é focável e rotulado", () => {
    expect(grep(String.raw`<div className="[^"]*overflow-x-auto[^"]*">`)).toBe("");
  });

  it("o menu do admin recolhe no celular (M34)", () => {
    expect(grep(String.raw`aria-controls="admin-menu"`)).toContain("AdminNav");
  });
});
