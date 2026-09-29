import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const md = readFileSync("DESIGN.md", "utf8").toLowerCase();
const tokens = JSON.parse(readFileSync("docs/brand/tokens.json", "utf8")) as {
  color: Record<string, string>;
  font: { familia: string };
};

describe("DESIGN.md", () => {
  it.each(["#0f1b2d", "#f5f2ea", "#2fcb86", "#0b6b4a", "plus jakarta sans"])("cita %s", (v) => {
    expect(md).toContain(v);
  });

  it("cita todos os hex de docs/brand/tokens.json", () => {
    for (const hex of Object.values(tokens.color)) expect(md).toContain(hex.toLowerCase());
  });

  it("cita a família de fonte de tokens.json", () => {
    expect(md).toContain(tokens.font.familia.toLowerCase());
  });

  it("menciona prefers-reduced-motion e alvo de 44 px", () => {
    expect(md).toContain("prefers-reduced-motion");
    expect(md).toContain("44 px");
  });

  it("DESIGN.md tem os sistemas da S29", () => {
    for (const t of ["botões e ações", "feedback", "movimento", "--mov-base", "aria-busy"]) expect(md).toContain(t);
  });
});
