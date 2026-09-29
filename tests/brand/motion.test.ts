import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("sistema de movimento", () => {
  it("define os três tokens com os valores do spec", () => {
    expect(css).toMatch(/--mov-rapido:\s*120ms/);
    expect(css).toMatch(/--mov-base:\s*200ms/);
    expect(css).toMatch(/--mov-entrada:\s*320ms/);
  });
  it("nenhuma animação ou transição passa de 400 ms", () => {
    const ms = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(Math.max(...ms)).toBeLessThanOrEqual(400);
  });
  it("reduced-motion zera animação e transição globalmente", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation(-duration)?:\s*(none|0s|0\.01ms)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition(-duration)?:\s*(none|0s|0\.01ms)/);
  });
  it("não há loop decorativo", () => {
    expect(css).not.toMatch(/animation:[^;]*infinite/);
  });
});
