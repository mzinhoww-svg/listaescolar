import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { TextDecoder } from "node:util";

import type { FileError } from "./ports";
import { INEP_COLUMNS, REQUIRED_COLUMNS, type InepColumn, type RawInepRow } from "./schemas";

export type ParsedCsv = {
  rows: RawInepRow[];
  errors: FileError[];
  /** Linha do arquivo em que cada registro termina (cabeçalho = 1); igual ao início quando o registro não quebra linha. */
  lines: number[];
  delimiter: ";" | ",";
  encoding: Encoding;
};

export type Encoding = "utf-8" | "win1252";
export const MAX_RECORD_SIZE = 64 * 1024;

const KNOWN = new Set<string>(INEP_COLUMNS);

function decode(buffer: Buffer): { text: string; encoding: Encoding } {
  try {
    // fatal: bytes inválidos em UTF-8 caem para Windows-1252 (o INEP costuma vir assim).
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
  } catch {
    return { text: iconv.decode(buffer, "win1252"), encoding: "win1252" };
  }
}

// "Ã§", "Ã£", "Â°", "â€"... : UTF-8 lido como Windows-1252 e regravado (mojibake); U+FFFD/C1: byte indefinido.
const MOJIBAKE = /[ÃÂ][\u0080-\u00bf]|â€|[\ufffd\u0080-\u009f]/;

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
  const fail = (errors: FileError[]): ParsedCsv => ({ rows: [], lines: [], errors, delimiter, encoding });
  if (text.trim().length === 0) return fail([{ code: "empty_file", message: "Arquivo vazio" }]);
  if (MOJIBAKE.test(text)) {
    return fail([
      {
        code: "encoding_ambiguous",
        message:
          "Não foi possível determinar a codificação do arquivo (há caracteres corrompidos, como \"Ã§\"). Salve o CSV como UTF-8 ou Windows-1252 a partir da fonte original e reenvie.",
      },
    ]);
  }

  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(text, {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
      trim: true,
      bom: true,
      info: true,
      max_record_size: MAX_RECORD_SIZE,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (e) {
    return fail([{ code: "invalid_csv", message: `CSV malformado: ${e instanceof Error ? e.message : "erro de leitura"}` }]);
  }
  const [first, ...bodyRecords] = records;
  const head = first?.record;
  if (!head) return fail([{ code: "empty_file", message: "Arquivo sem cabeçalho" }]);

  const header = head.map((h) => h.trim().toUpperCase());
  const errors: FileError[] = [];
  const seen = new Set<string>();
  for (const h of header) {
    if (seen.has(h) && KNOWN.has(h)) {
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
  const rows = bodyRecords.map(({ record }) => {
    const row: RawInepRow = {};
    for (const [col, i] of idx) row[col] = record[i] ?? "";
    return row;
  });
  return { rows, lines: bodyRecords.map((r) => r.info.lines), errors: [], delimiter, encoding };
}
