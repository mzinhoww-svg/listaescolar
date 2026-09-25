import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PUB = join(ROOT, "supabase/functions/_shared/publication");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(n)) out.push(p);
  }
  return out;
}
const read = (f: string) => readFileSync(f, "utf8");
// só comentários de linha inteiros (// ...) são ignorados nas varreduras de literais
const code = (f: string) => read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("varreduras do motor de publicação", () => {
  it("rules.ts e decide.ts: sem literal numérico decimal (limiares só vêm de ai_settings)", () => {
    const files = [join(PUB, "rules.ts"), join(PUB, "decide.ts")].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(code(f).match(/\b0?\.\d+\b/g) ?? [], f).toEqual([]);
  });
  it("rules.ts e decide.ts: sem código de alerta crítico fixo nem lista de críticos fixa", () => {
    for (const n of ["rules.ts", "decide.ts"]) {
      const f = join(PUB, n);
      let src: string;
      try { src = code(f); } catch { continue; }
      expect(src, n).not.toMatch(/handwritten|text_document_mismatch/);
      expect(src, n).not.toMatch(/criticalAlerts\s*=\s*\[/);
    }
  });
  it("_shared/publication/** não importa roteador, openrouter, features/lists|grades|cart", () => {
    const files = walk(PUB);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const imports = read(f).split("\n").filter((l) => /^\s*(import|export)\b.*\bfrom\b|^\s*import\s*\(/.test(l) || /import\(/.test(l));
      for (const l of imports) {
        expect(l, f).not.toMatch(/ai\/router|ai\/openrouter|features\/(lists|grades|cart)|\.\.\/\.\.\/\.\.\/features/);
      }
    }
  });
  it("_shared/publication/** não usa SDK de provedor nem process/Deno globais", () => {
    for (const f of walk(PUB)) expect(code(f), f).not.toMatch(/openrouter|process\.env|Deno\./i);
  });
  it("features/publication/rules.ts só reexporta a fonte única", () => {
    const src = read(join(ROOT, "features/publication/rules.ts"));
    expect(src).toMatch(/_shared\/publication\/rules/);
  });
});
