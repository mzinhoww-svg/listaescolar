import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { TextDecoder } from "node:util";

import type { FileError } from "./ports";
import { INEP_COLUMNS, REQUIRED_COLUMNS, type InepColumn, type RawInepRow } from "./schemas";

export type ParsedCsv = {
  rows: RawInepRow[];
  errors: FileError[];
  delimiter: ";" | ",";
  encoding: "utf-8" | "latin1";
};

const KNOWN = new Set<string>(INEP_COLUMNS);

function decode(buffer: Buffer): { text: string; encoding: "utf-8" | "latin1" } {
  try {
    // fatal: bytes inválidos em UTF-8 caem para latin1 (INEP costuma vir assim). Remove BOM.
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
  } catch {
    return { text: iconv.decode(buffer, "latin1"), encoding: "latin1" };
  }
}

function detectDelimiter(text: string): ";" | "," {
  let semi = 0;
  let comma = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ";") semi += 1;
    else if (!quoted && ch === ",") comma += 1;
  }
  return comma > semi ? "," : ";";
}

/** Lê o CSV do INEP: detecta codificação e separador, valida o cabeçalho e devolve linhas brutas (só colunas conhecidas). */
export function parseInepCsv(buffer: Buffer): ParsedCsv {
  const { text, encoding } = decode(buffer);
  const delimiter = detectDelimiter(text);
  const fail = (errors: FileError[]): ParsedCsv => ({ rows: [], errors, delimiter, encoding });
  if (text.trim().length === 0) return fail([{ code: "empty_file", message: "Arquivo vazio" }]);

  let records: string[][];
  try {
    records = parse(text, {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
      trim: true,
      bom: true,
    }) as string[][];
  } catch (e) {
    return fail([{ code: "invalid_csv", message: `CSV malformado: ${e instanceof Error ? e.message : "erro de leitura"}` }]);
  }
  const [head, ...body] = records;
  if (!head) return fail([{ code: "empty_file", message: "Arquivo sem cabeçalho" }]);

  const header = head.map((h) => h.trim().toUpperCase());
  const errors: FileError[] = [];
  const seen = new Set<string>();
  for (const h of header) {
    if (seen.has(h) && h) {
      if (!errors.some((e) => e.column === h)) {
        errors.push({ code: "duplicate_column", message: `Coluna duplicada: ${h}`, column: h });
      }
    }
    seen.add(h);
  }
  for (const col of REQUIRED_COLUMNS) {
    if (!seen.has(col)) errors.push({ code: "missing_column", message: `Coluna obrigatória ausente: ${col}`, column: col });
  }
  if (errors.length > 0) return fail(errors);

  const idx: [InepColumn, number][] = [];
  header.forEach((h, i) => {
    if (KNOWN.has(h)) idx.push([h as InepColumn, i]);
  });
  const rows = body.map((cells) => {
    const row: RawInepRow = {};
    for (const [col, i] of idx) row[col] = cells[i] ?? "";
    return row;
  });
  return { rows, errors: [], delimiter, encoding };
}
