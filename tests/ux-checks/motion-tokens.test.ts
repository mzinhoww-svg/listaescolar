import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

describe("durações só pelos tokens de movimento (J9-16)", () => {
  it("a duração padrão de transição do Tailwind é --mov-rapido, não 150 ms", () => {
    expect(css).toMatch(/@theme[^{]*\{[^}]*--default-transition-duration:\s*var\(--mov-rapido\)/);
  });
  it("nenhuma classe duration-<número> nem duration-[...] no código-fonte de UI", () => {
    const bad = ["app", "components", "features"].flatMap((d) => files(join(process.cwd(), d))).filter((f) => /\bduration-(\d|\[)/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("o Tailwind não varre docs e testes (exemplos de classe ali gerariam CSS fora dos tokens)", () => {
    expect(css).toMatch(/@source not "\.\.\/docs"/);
    expect(css).toMatch(/@source not "\.\.\/tests"/);
  });
});
