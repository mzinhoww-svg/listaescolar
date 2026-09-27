/**
 * Guarda de tamanho de arquivo (S18, D-057): lista módulos-fonte acima de 250 linhas e falha (código 1) se algum
 * dos 10 arquivos de D-057 regredir para acima do limite. Uso: `pnpm tsx scripts/check-file-sizes.ts` (ou
 * `pnpm check:sizes`). Não cobre `.tsx` de React sozinho (a regra do CLAUDE.md para componente já é reforçada por
 * `pnpm lint`/revisão manual); esta guarda é sobre módulos (repositórios, motores, núcleo de IA).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { D057_WATCH_LIST, DEFAULT_LIMIT, buildSizeReport, countLines, isSourceFile, type FileEntry } from "./check-file-sizes-lib";

const ROOTS = ["app", "components", "features", "lib", "supabase/functions"];
const IGNORE_DIRS = new Set(["node_modules", ".next", ".track-workdir", "dist"]);

function walk(dir: string, repoRoot: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, repoRoot, out);
    } else {
      const rel = relative(repoRoot, full);
      if (isSourceFile(rel)) out.push(rel);
    }
  }
}

function main(): number {
  const repoRoot = process.cwd();
  const paths: string[] = [];
  for (const root of ROOTS) walk(join(repoRoot, root), repoRoot, paths);

  const entries: FileEntry[] = paths.map((path) => ({
    path,
    lines: countLines(readFileSync(join(repoRoot, path), "utf8")),
  }));

  const report = buildSizeReport(entries, DEFAULT_LIMIT, D057_WATCH_LIST);

  console.log(`Arquivos acima de ${DEFAULT_LIMIT} linhas (${report.overLimit.length}):`);
  for (const e of report.overLimit) {
    const watched = D057_WATCH_LIST.includes(e.path as (typeof D057_WATCH_LIST)[number]) ? " [D-057]" : "";
    console.log(`  ${e.lines}\t${e.path}${watched}`);
  }

  if (report.watchedRegressions.length > 0) {
    console.error(`\nRegressão de D-057: ${report.watchedRegressions.length} arquivo(s) vigiado(s) ainda acima do limite.`);
    return 1;
  }
  console.log("\nD-057: nenhum dos 10 arquivos vigiados está acima do limite.");
  return 0;
}

process.exit(main());
