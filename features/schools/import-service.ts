import { createHash } from "node:crypto";

import { parseInepCsv } from "./inep-csv";
import type { ApplyRow, BatchTotals, FileError, ImportResult, SchoolsImportRepository, Totals } from "./ports";
import { parseInepRow, type RawInepRow } from "./schemas";

export const MAX_CHUNK_SIZE = 500;
export const MAX_RAW_CELL = 1000;

export type ImportInput = { fileName: string; buffer: Buffer; importedBy: string | null; isDemo: boolean };
export type ImportDeps = { repo: SchoolsImportRepository; hash?: (b: Buffer) => string; chunkSize?: number };

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const ZERO: Totals = { inserted: 0, updated: 0, duplicate: 0, rejected: 0, unchanged: 0 };
const withTotal = (t: Totals): BatchTotals => ({
  ...t,
  total: t.inserted + t.updated + t.duplicate + t.rejected + t.unchanged,
});

function toApplyRow(raw: RawInepRow, rowNumber: number, isDemo: boolean): ApplyRow {
  // raw guardado só com as colunas conhecidas, já aparadas pelo parser e limitadas a MAX_RAW_CELL caracteres.
  const rawRecord: Record<string, string> = Object.fromEntries(
    Object.entries(raw)
      .filter((e): e is [string, string] => typeof e[1] === "string")
      .map(([k, v]) => [k, v.slice(0, MAX_RAW_CELL)]),
  );
  const parsed = parseInepRow(raw);
  if (!parsed.success) {
    return {
      row_number: rowNumber,
      inep: raw.CO_ENTIDADE?.trim() || null,
      name: raw.NO_ENTIDADE?.trim() || null,
      ibge_code: raw.CO_MUNICIPIO?.trim() || null,
      is_demo: isDemo,
      raw: rawRecord,
      errors: parsed.errors,
    };
  }
  const s = parsed.data;
  return {
    row_number: rowNumber,
    inep: s.inep,
    name: s.name,
    normalized_name: s.normalizedName,
    network: s.network,
    neighborhood: s.neighborhood,
    address: s.address,
    cep: s.cep,
    phone: s.phone,
    email: s.email,
    ibge_code: s.ibgeCode,
    is_demo: isDemo,
    raw: rawRecord,
  };
}

/**
 * Importa um CSV do INEP: hash -> claim atômico -> fatias de até 500 linhas -> apply -> finish.
 * Só o dono do claim processa (lote novo, `pending`/`failed` ou `processing` parado há mais de 10 min);
 * os demais recebem o lote existente. `row_number` é a linha do arquivo em que o registro termina.
 */
export async function importInepFile(input: ImportInput, deps: ImportDeps): Promise<ImportResult> {
  const { repo } = deps;
  const chunkSize = Math.min(Math.max(1, Math.floor(deps.chunkSize ?? MAX_CHUNK_SIZE)), MAX_CHUNK_SIZE);
  const fileHash = (deps.hash ?? sha256)(input.buffer);

  const claim = await repo.claimBatch({
    fileHash,
    fileName: input.fileName,
    importedBy: input.importedBy,
    isDemo: input.isDemo,
  });

  if (!claim.owner) {
    const info = await repo.getBatch(claim.batchId);
    if (!info) throw new Error("lote existente não encontrado");
    const mismatch = claim.isDemo !== input.isDemo;
    return {
      batchId: claim.batchId,
      alreadyExisted: true,
      resumed: false,
      status: info.status,
      totals: info.totals,
      fileErrors: mismatch
        ? [
            {
              code: "demo_flag_mismatch",
              message: claim.isDemo
                ? "Este arquivo já foi importado como demonstração; a marcação enviada é de dados reais."
                : "Este arquivo já foi importado como dados reais; a marcação enviada é de demonstração.",
            },
          ]
        : [],
    };
  }
  const resumed = claim.alreadyExisted;

  const parsed = parseInepCsv(input.buffer);
  if (parsed.errors.length > 0) {
    await repo.finishBatch(claim.batchId, "failed");
    return {
      batchId: claim.batchId,
      alreadyExisted: claim.alreadyExisted,
      resumed,
      status: "failed",
      totals: withTotal(ZERO),
      fileErrors: parsed.errors,
    };
  }

  const totals: Totals = { ...ZERO };
  const fileErrors: FileError[] = [];
  let status: "completed" | "failed" = "completed";
  try {
    for (let start = 0; start < parsed.rows.length; start += chunkSize) {
      const slice = parsed.rows.slice(start, start + chunkSize);
      const payload = slice.map((raw, i) => toApplyRow(raw, parsed.lines[start + i] ?? start + i + 2, input.isDemo));
      const t = await repo.applyRows(claim.batchId, payload);
      totals.inserted += t.inserted;
      totals.updated += t.updated;
      totals.duplicate += t.duplicate;
      totals.rejected += t.rejected;
      totals.unchanged += t.unchanged;
    }
  } catch (e) {
    status = "failed";
    fileErrors.push({
      code: "processing_failed",
      message: `Falha ao processar o arquivo: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    });
  }

  try {
    await repo.finishBatch(claim.batchId, status);
  } catch (e) {
    if (status === "completed") throw e; // sem fechar o lote não há como afirmar sucesso.
  }
  return {
    batchId: claim.batchId,
    alreadyExisted: claim.alreadyExisted,
    resumed,
    status,
    totals: withTotal(totals),
    fileErrors,
  };
}
