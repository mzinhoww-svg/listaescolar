import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("sistema de movimento", () => {
  it("define os três tokens com os valores do spec", () => {
    expect(css).toMatch(/--mov-rapido:\s*120ms/);
    expect(css).toMatch(/--mov-base:\s*200ms/);
    expect(css).toMatch(/--mov-entrada:\s*320ms/);
  });
  it("curvas de easing fixadas em globals.css e DESIGN.md (spec 7.3)", () => {
    const md = readFileSync("DESIGN.md", "utf8");
    const out = "cubic-bezier(0.2, 0, 0, 1)";
    const inn = "cubic-bezier(0.4, 0, 1, 1)";
    expect(css).toContain(`--mov-ease-out: ${out};`);
    expect(css).toContain(`--mov-ease-in: ${inn};`);
    expect(md).toContain(`\`--mov-ease-out\` | \`${out}\``);
    expect(md).toContain(`\`--mov-ease-in\` | \`${inn}\``);
  });
  it("nenhuma duração ou atraso de animação/transição passa de 400 ms (ms e s)", () => {
    // Exceção explícita: só indicadores de carregamento, e só se a regra existir no arquivo.
    const exempt = ["animate-spin", "animate-pulse", "pesquisa-pulso"].filter((n) => css.includes(n));
    let scoped = css;
    for (const name of exempt) {
      scoped = scoped.replace(new RegExp(`[^{}]*${name}[^{}]*\\{[^{}]*(\\{[^{}]*\\}[^{}]*)*\\}`, "g"), "");
    }
    const decls = [...scoped.matchAll(/(?:animation|transition)(?:-duration|-delay)?\s*:[^;}]+/g)].map((m) => m[0]);
    expect(decls.length).toBeGreaterThan(0);
    const times = decls.flatMap((d) =>
      [...d.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map((m) => Number(m[1]) * (m[2] === "s" ? 1000 : 1)),
    );
    expect(Math.max(...times)).toBeLessThanOrEqual(400);
  });
  it("tick-loop roda uma vez, sem atraso longo", () => {
    expect(css).toMatch(/\.tick-loop[^{]*\{[^}]*animation:\s*tick-loop var\(--mov-entrada\)/);
    expect(css).not.toMatch(/\.tick-loop[^{]*\{[^}]*animation:[^;]*\b\d+\s*;/);
  });
  it("reduced-motion também zera animation-delay", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-delay:\s*0s/);
  });
  it("reduced-motion zera animação e transição globalmente", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation(-duration)?:\s*(none|0s|0\.01ms)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition(-duration)?:\s*(none|0s|0\.01ms)/);
  });
  it("não há loop decorativo", () => {
    expect(css).not.toMatch(/animation:[^;]*infinite/);
  });
});
