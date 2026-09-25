import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PUB = join(process.cwd(), "supabase/functions/_shared/publication");
const code = (f: string) => readFileSync(join(PUB, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("varreduras da Task 2", () => {
  it("decide.ts, sweep.ts e settings.ts sem literal decimal (limiares só de ai_settings)", () => {
    for (const f of ["decide.ts", "sweep.ts", "settings.ts"]) expect(code(f).match(/\b0?\.\d+\b/g) ?? [], f).toEqual([]);
  });
  it("só decide.ts chama a porta publish e só depois de beginPublish", () => {
    const src = code("decide.ts");
    expect(src.match(/\.publish\(/g)?.length).toBe(1);
    expect(src.indexOf("beginPublish")).toBeGreaterThan(-1);
    // a única chamada de `publishWithTimeout` (que envolve `.publish(`) vem depois da lease
    const calls = [...src.matchAll(/publishWithTimeout\(/g)].map((m) => m.index!);
    expect(calls).toHaveLength(2); // definição + uma chamada
    expect(src.indexOf("beginPublish")).toBeLessThan(calls[1]!);
    for (const f of ["sweep.ts", "settings.ts", "composition.ts", "rpc-store.ts"]) expect(code(f), f).not.toMatch(/\.publish\(/);
  });
  it("memória só é instanciada pela composição", () => {
    for (const f of ["decide.ts", "sweep.ts", "settings.ts", "rpc-store.ts"]) expect(code(f), f).not.toMatch(/new Memory|from "\.\/memory/);
    expect(code("composition.ts")).toMatch(/explicitNonProduction/);
  });
  it("as linhas gravadas pelo serviço nunca levam nome de material, arquivo ou contato", () => {
    const src = code("decide.ts");
    expect(src).not.toMatch(/file_name|storage_path|notify_target|originalName.*payload/);
  });
});
