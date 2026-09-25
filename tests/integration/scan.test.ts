// Varreduras da S11: a integração só fala com o banco por RPC e nenhum leitor/publicador escreve direto nas tabelas de listas.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" || n === ".next" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const read = (p: string) => readFileSync(p, "utf8");
const LIST_TABLES = /\.from\(\s*["'](school_lists|list_versions|list_items|list_status_events)["']\s*\)/;

describe("varredura: integração só por RPC", () => {
  const files = [...walk(resolve(ROOT, "features/integration")), resolve(ROOT, "supabase/functions/_shared/publication/rpc-ports.ts")];
  it("features/integration/** e rpc-ports.ts não usam .from() nas tabelas de listas", () => {
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(read(f), f).not.toMatch(LIST_TABLES);
  });
  it("features/integration/** é server-only (service role nunca no cliente)", () => {
    for (const f of walk(resolve(ROOT, "features/integration"))) expect(read(f), f).toMatch(/^import "server-only";/m);
  });
  it("nenhuma trilha além da dona (features/lists, S05) escreve em school_lists/list_versions/list_items", () => {
    for (const dir of ["app", "features", "lib", "components", "supabase/functions"]) {
      for (const f of walk(resolve(ROOT, dir))) {
        if (f.includes(`${join("features", "lists")}/`)) continue;
        const src = read(f);
        expect(src, f).not.toMatch(/\.from\(\s*["'](school_lists|list_versions|list_items)["']\s*\)\s*\.\s*(insert|update|upsert|delete)\b/);
      }
    }
  });
  it("as portas em memória só entram pela composição (features/publication e o worker não as constroem)", () => {
    for (const f of [...walk(resolve(ROOT, "app")), ...walk(resolve(ROOT, "features")), ...walk(resolve(ROOT, "supabase/functions/ocr-worker"))]) {
      expect(read(f), f).not.toMatch(/new MemoryListPublisher\(|new MemoryPublicationContextReader\(/);
    }
  });
});
