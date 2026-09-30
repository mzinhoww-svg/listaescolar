import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOURNEYS } from "@/lib/ux-checks/journeys";

function pages(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pages(full, `${prefix}/${name}`));
    else if (name === "page.tsx") out.push(prefix || "/");
  }
  return out;
}

/** Tira grupos `(x)` e troca `[param]` e `{param}` por `*`. */
const norm = (route: string) => {
  const p = route.split("?")[0]!.split("/").filter((seg) => !/^\(.*\)$/.test(seg)).join("/").replace(/\[[^\]]+\]|\{[^}]+\}/g, "*");
  return p === "" ? "/" : p;
};

describe("JOURNEYS cobre todas as rotas de página", () => {
  const covered = new Set(Object.values(JOURNEYS).flatMap((j) => j.rotas.map((r) => norm(r.path))));
  const routes = pages(join(process.cwd(), "app")).map(norm);

  it("encontra páginas no app", () => {
    expect(routes.length).toBeGreaterThan(50);
  });
  it("toda page.tsx aparece em ao menos uma jornada", () => {
    expect(routes.filter((r) => !covered.has(r))).toEqual([]);
  });
  it("rota sem seed traz motivo", () => {
    for (const j of Object.values(JOURNEYS)) for (const r of j.rotas) if (r.skip) expect(r.skip.length).toBeGreaterThan(10);
  });
  it("nenhuma rota de detalhe fica pulada por falta de seed (Task 10)", () => {
    const puladas = Object.values(JOURNEYS).flatMap((j) => j.rotas.filter((r) => r.skip).map((r) => r.path));
    expect(puladas).toEqual([]);
  });
});
