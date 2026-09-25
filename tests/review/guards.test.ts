import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] => {
  try {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  } catch {
    return [];
  }
};
const src = (dir: string) => walk(dir).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");

describe("varreduras da revisão humana (S10)", () => {
  const domain = src("features/review");

  it("há arquivos de domínio", () => {
    expect(domain.length).toBeGreaterThan(8);
  });

  it("features/review: sem dangerouslySetInnerHTML, sem features de outras trilhas, sem IA", () => {
    for (const f of domain) {
      const t = read(f);
      expect(t, f).not.toMatch(/dangerouslySetInnerHTML/);
      expect(t, f).not.toMatch(/features\/(lists|grades|schools|cart)\b/);
      expect(t, f).not.toMatch(/ai\/router|ai\/openrouter|lib\/ai\/providers|OPENROUTER/);
    }
  });

  it("nenhuma UI de revisão usa dangerouslySetInnerHTML (admin, revisão do pai e componentes)", () => {
    const ui = [...src("app/admin/revisao"), ...src("app/enviar-lista"), ...src("components/review")].filter((f) => /revisao|revisar|components\/review/.test(f));
    for (const f of ui) expect(read(f), f).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("nenhum SQL/consulta da revisão toca school_lists, list_versions ou schools", () => {
    for (const f of domain) expect(read(f), f).not.toMatch(/["'`]\s*(school_lists|list_versions|schools)\s*["'`]|from\(["'](school_lists|list_versions|schools)["']\)/);
  });

  it("parent-copy.ts é isolado: não importa publicação, portas nem funções review_ do admin", () => {
    const t = read("features/review/parent-copy.ts");
    expect(t).not.toMatch(/publish|ports|review_|gate|service"|repository|read-models/i);
    expect(t).toMatch(/parent_copy_open/);
    // e nenhum outro módulo do domínio referencia a cópia do pai
    for (const f of domain.filter((x) => !x.endsWith("parent-copy.ts") && !x.endsWith("deps.ts"))) expect(read(f), f).not.toMatch(/parent_copy_|parent_list_copies/);
  });

  it("nenhum componente/módulo do domínio passa de 250 linhas", () => {
    for (const f of [...domain, ...src("components/review"), ...src("app/admin/revisao")]) expect(read(f).split("\n").length, f).toBeLessThanOrEqual(250);
  });
});
