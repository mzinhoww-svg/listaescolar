/**
 * Lógica pura de `check-file-sizes.ts` (S18, D-057): conta linhas de arquivos-fonte e decide se algum arquivo
 * "vigiado" (a lista de D-057, que precisa ficar em ≤ 250 linhas por Ruling desta fatia) regrediu. Extraída para
 * ser testável sem tocar no disco de verdade.
 */

export const DEFAULT_LIMIT = 250;

/** Extensões consideradas "fonte" para a varredura (exclui testes, tipos gerados e specs). */
export const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

export function isTestFile(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path) || /(^|\/)tests\//.test(path);
}

export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext)) && !isTestFile(path) && !path.endsWith(".d.ts");
}

export type FileEntry = { path: string; lines: number };

export type SizeReport = {
  /** Todos os arquivos acima do limite, ordenados do maior para o menor. */
  overLimit: FileEntry[];
  /** Dos "vigiados" (D-057), os que ainda estão acima do limite — se não vazio, o script sai com código 1. */
  watchedRegressions: FileEntry[];
};

/**
 * `watchList` é a lista de arquivos que uma dívida (D-057) prometeu trazer para ≤ `limit` linhas; a função é a
 * guarda de regressão: se qualquer um deles voltar a passar do limite (nova função grande adicionada de volta),
 * o script falha.
 */
export function buildSizeReport(entries: readonly FileEntry[], limit: number = DEFAULT_LIMIT, watchList: readonly string[] = []): SizeReport {
  const overLimit = entries.filter((e) => e.lines > limit).slice().sort((a, b) => b.lines - a.lines);
  const watched = new Set(watchList);
  const watchedRegressions = overLimit.filter((e) => watched.has(e.path));
  return { overLimit, watchedRegressions };
}

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  // conta separadores de linha; um arquivo sem \n final ainda tem 1 linha.
  const newlines = content.split("\n").length - 1;
  return content.endsWith("\n") ? newlines : newlines + 1;
}

/** Os 10 arquivos de D-057 (docs/superpowers/DEBT.md); caminhos relativos à raiz do repositório. */
export const D057_WATCH_LIST = [
  "features/stationeries/repository.ts",
  "features/leads/repository.ts",
  "features/cart/options-engine.ts",
  "supabase/functions/_shared/worker-core.ts",
  "supabase/functions/_shared/publication/decide.ts",
  "features/cart/repository.ts",
  "features/claims/queries.ts",
  "supabase/functions/_shared/ai/router.ts",
  "supabase/functions/_shared/ai/extraction.ts",
  "features/claims/repository.ts",
] as const;
