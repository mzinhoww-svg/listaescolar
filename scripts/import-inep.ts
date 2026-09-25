/**
 * Importa um CSV do INEP direto no banco (arquivos acima do limite de 4 MB do upload web, p.ex. o CSV oficial, S20).
 * Uso: pnpm import:inep <arquivo.csv> [--demo] [--i-know-this-is-production]
 * Exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente. `server-only` é neutralizado pelo
 * `--conditions=react-server` do script npm (o pacote resolve para um módulo vazio).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { buildErrorReportCsv } from "@/features/schools/error-report";
import { importInepFile } from "@/features/schools/import-service";
import { createSchoolsRepository } from "@/features/schools/repository";
import { createSupabaseGateway } from "@/features/schools/supabase-gateway";

import { assertSafeTarget, parseArgs, reportPath } from "./import-inep-lib";

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.");
  assertSafeTarget(url, args);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const repo = createSchoolsRepository(createSupabaseGateway(client));
  const buffer = readFileSync(args.file);
  const result = await importInepFile(
    { fileName: basename(args.file), buffer, importedBy: null, isDemo: args.demo },
    { repo },
  );

  const t = result.totals;
  console.log(`Lote ${result.batchId} · ${result.status}${result.alreadyExisted ? " (lote já existia)" : ""}`);
  console.log(
    `Total ${t.total} · inseridas ${t.inserted} · atualizadas ${t.updated} · sem alteração ${t.unchanged} · duplicadas ${t.duplicate} · rejeitadas ${t.rejected}`,
  );
  for (const e of result.fileErrors) console.error(`Erro do arquivo: ${e.message}`);
  if (t.duplicate + t.rejected > 0) {
    const path = reportPath(process.cwd(), result.batchId);
    writeFileSync(path, buildErrorReportCsv(await repo.getErrorRows(result.batchId)));
    console.log(`Erros: ${path}`);
  }
  return result.status === "completed" && result.fileErrors.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
