import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decideListPublication, resumePublication } from "../../supabase/functions/_shared/publication/decide";
import type { PublishRequest } from "../../supabase/functions/_shared/publication/ports";
import { SUBMISSION, kit } from "./helpers";

const PUB = join(process.cwd(), "supabase/functions/_shared/publication");
const code = (f: string) => readFileSync(join(PUB, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("varreduras da Task 2", () => {
  it("decide.ts, sweep.ts e settings.ts sem literal decimal (limiares só de ai_settings)", () => {
    for (const f of ["decide.ts", "sweep.ts", "settings.ts"]) expect(code(f).match(/\b0?\.\d+\b/g) ?? [], f).toEqual([]);
  });
  it("só decide.ts chama a porta publish (nenhum outro módulo do serviço)", () => {
    expect(code("decide.ts").match(/\.publish\(/g)?.length).toBe(1);
    for (const f of ["sweep.ts", "settings.ts", "composition.ts", "rpc-store.ts"]) expect(code(f), f).not.toMatch(/\.publish\(/);
  });
  it("a porta só é chamada depois de beginPublish devolver `leased` (prova comportamental)", async () => {
    const k = kit();
    const order: string[] = [];
    const begin = k.store.beginPublish.bind(k.store);
    k.store.beginPublish = async (...a) => { order.push("beginPublish"); return begin(...a); };
    const real = k.publisher;
    k.deps.publisher = { publish: async (r) => { order.push("publish"); return real.publish(r); } };
    expect((await decideListPublication(SUBMISSION, k.deps)).status).toBe("auto_published");
    expect(order).toEqual(["beginPublish", "publish"]);
  });
  it.each(["busy", "already_completed", "not_approved"] as const)("beginPublish=%s: a porta nunca é chamada", async (answer) => {
    const k = kit();
    const spy = vi.fn(async (r: PublishRequest) => k.publisher.publish(r));
    k.deps.publisher = { publish: spy };
    k.store.beginPublish = async () => answer;
    await decideListPublication(SUBMISSION, k.deps);
    await resumePublication(SUBMISSION, k.deps);
    expect(spy).not.toHaveBeenCalled();
  });
  it("memória só é instanciada pela composição", () => {
    for (const f of ["decide.ts", "sweep.ts", "settings.ts", "rpc-store.ts"]) expect(code(f), f).not.toMatch(/new Memory|from "\.\/memory/);
    expect(code("composition.ts")).toMatch(/MEMORY_PORT_ENVS/);
  });
  it("as linhas gravadas pelo serviço nunca levam nome de material, arquivo ou contato", () => {
    const src = code("decide.ts");
    expect(src).not.toMatch(/file_name|storage_path|notify_target|originalName.*payload/);
  });
});
