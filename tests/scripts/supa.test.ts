import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sem tipos
import { deriveConfig, parseTrack } from "../../scripts/supa.mjs";

const base = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const derive = deriveConfig as (text: string, index: number) => string;

describe("scripts/supa.mjs", () => {
  it("desloca project_id e portas por trilha", () => {
    const out = derive(base, 2);
    expect(out).toMatch(/^project_id = "listacerta-t2"$/m);
    expect(out).toMatch(/\[api\][\s\S]*?\nport = 54521/);
    expect(out).toMatch(/\[db\]\n(?:[^\n[][^\n]*\n|\n)*?port = 54522/);
    expect(out).toMatch(/shadow_port = 54520/);
    expect(out).toMatch(/inspector_port = 8085/);
    expect(out).toContain("127.0.0.1:3002");
    expect(out).not.toContain("127.0.0.1:3000");
  });

  it("é determinístico (mesma entrada, mesma saída) e não altera o original", () => {
    expect(derive(base, 3)).toBe(derive(base, 3));
    expect(base).toMatch(/^project_id = "listacerta"$/m);
  });

  it("falha alto quando uma seção some do config", () => {
    expect(() => derive(base.replace("[studio]", "[studio_x]"), 1)).toThrow(/studio/);
  });

  it("rejeita índice inválido", () => {
    for (const bad of ["abc", "10", "-1", "1.5", ""]) {
      if (bad === "") expect(parseTrack(bad)).toBe(0);
      else expect(() => parseTrack(bad)).toThrow();
    }
  });
});
