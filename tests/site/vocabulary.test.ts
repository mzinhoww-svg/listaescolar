import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Pastas de `features/` cujo texto aparece só no painel B2B, papelaria, cobrança ou admin (onde "lead" é o termo da casa). */
const PANEL_ONLY = new Set(["b2b", "billing", "campaigns", "payouts", "stationeries", "webhooks", "conversion", "reports", "ai-settings", "admin"]);

function collect(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/(^|\/)(messages(-[a-z]+)?|copy)\.ts$/.test(p)) out.push(p);
  }
  return out;
}

const files = collect("features").filter((f) => !PANEL_ONLY.has(f.split("/")[1] ?? ""));
const strings = (src: string) => [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? "");

const BANNED: [string, RegExp][] = [
  ["lead (use pedido de cotação)", /\bleads?\b/i],
  ["reivindicar (use pedir para administrar)", /reivindic/i],
  ["candidata sem explicação (use lista em análise)", /candidatas?\b/i],
];

describe("vocabulário do produto (M14)", () => {
  it("varre arquivos de texto do usuário", () => {
    expect(files).toContain("features/site/copy.ts");
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s não usa termo banido", (file) => {
    const found: string[] = [];
    for (const s of strings(readFileSync(file, "utf8"))) {
      for (const [label, re] of BANNED) if (re.test(s)) found.push(`${label}: "${s.slice(0, 60)}"`);
    }
    expect(found).toEqual([]);
  });

  it("INEP na home vem com explicação", () => {
    const copy = readFileSync("features/site/copy.ts", "utf8");
    expect(copy).toMatch(/código INEP \(o número da escola/);
  });
});
