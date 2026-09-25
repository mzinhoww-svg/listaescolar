/** Parte pura do `pnpm import:inep` (sem I/O): argumentos, proteção de alvo e nome do relatório. */
import { join } from "node:path";

import { safeReportFileName } from "@/features/schools/error-report";

export const STAGING_REF = "hojbnqkwzsicahzgshne";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export type CliArgs = { file: string; demo: boolean; allowProduction: boolean };

export function parseArgs(argv: string[]): CliArgs {
  let demo = false;
  let allowProduction = false;
  const files: string[] = [];
  for (const a of argv) {
    if (a === "--demo") demo = true;
    else if (a === "--i-know-this-is-production") allowProduction = true;
    else if (a.startsWith("--")) throw new Error(`Opção desconhecida: ${a}`);
    else files.push(a);
  }
  const [file] = files;
  if (!file || files.length !== 1) {
    throw new Error("Uso: pnpm import:inep <arquivo.csv> [--demo] [--i-know-this-is-production]");
  }
  return { file, demo, allowProduction };
}

/** Só banco local (loopback) ou o projeto de staging; qualquer outro alvo exige a flag explícita. */
export function assertSafeTarget(url: string, flags: { allowProduction: boolean }): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL inválida.");
  }
  if (LOOPBACK.has(host) || host === `${STAGING_REF}.supabase.co`) return;
  if (flags.allowProduction) return;
  throw new Error(
    `Alvo ${host} não é local nem o staging. Recusado; para importar em outro projeto use --i-know-this-is-production.`,
  );
}

export function reportPath(dir: string, batchId: string): string {
  return join(dir, safeReportFileName(batchId));
}
