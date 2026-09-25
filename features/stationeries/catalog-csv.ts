import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";

import {
  catalogItemKey,
  neutralizeFormula,
  parsePriceToCents,
  parseStockAnswer,
  startsWithFormula,
  type CatalogItem,
} from "./catalog";

export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 2000;

export type CatalogCsvRowError = { line: number; field: string; message: string; value: string };
export type CatalogCsvFatal = "empty" | "too_large" | "too_many_rows" | "missing_columns" | "malformed";
export type CatalogCsvResult =
  | { ok: false; fatal: CatalogCsvFatal; message: string; missing?: string[] }
  | { ok: true; items: (CatalogItem & { itemKey: string; line: number })[]; errors: CatalogCsvRowError[]; totalRows: number };

const FATAL_MESSAGES: Record<CatalogCsvFatal, string> = {
  empty: "A planilha está vazia.",
  too_large: "A planilha passa de 2 MB.",
  too_many_rows: "A planilha passa de 2.000 linhas.",
  missing_columns: "Faltam colunas obrigatórias (nome e preco).",
  malformed: "Não foi possível ler a planilha (aspas ou formato inválido).",
};
const fatal = (f: CatalogCsvFatal, missing?: string[]): CatalogCsvResult => ({
  ok: false,
  fatal: f,
  message: FATAL_MESSAGES[f],
  ...(missing ? { missing } : {}),
});

const NAME_ALIASES = ["nome", "produto", "item", "descricao"];
const PRICE_ALIASES = ["preco", "valor", "preco unitario"];
const STOCK_ALIASES = ["estoque", "em estoque"];

function decode(buffer: Uint8Array): string {
  const buf = Buffer.from(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return iconv.decode(buf, "win1252"); // planilhas exportadas pelo Excel no Windows
  }
}

const headerKey = (h: string): string =>
  h
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLowerCase();

/**
 * Lê a planilha de catálogo (colunas `nome`, `preco`, `estoque` opcional; separador `,` ou `;`).
 * Erros por linha não interrompem as demais; limites e colunas faltando são fatais.
 * Nomes que começam com `= + - @` são recusados (fórmula); duplicados no arquivo: vale a primeira linha.
 */
export function parseCatalogCsv(buffer: Uint8Array): CatalogCsvResult {
  if (buffer.byteLength === 0) return fatal("empty");
  if (buffer.byteLength > CSV_MAX_BYTES) return fatal("too_large");
  const text = decode(buffer);
  if (text.trim() === "") return fatal("empty");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";

  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(text, {
      delimiter,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      info: true,
    }) as unknown as typeof records;
  } catch {
    return fatal("malformed");
  }
  const header = records[0];
  if (!header) return fatal("empty");
  const cols = header.record.map(headerKey);
  const nameIdx = cols.findIndex((c) => NAME_ALIASES.includes(c));
  const priceIdx = cols.findIndex((c) => PRICE_ALIASES.includes(c));
  const stockIdx = cols.findIndex((c) => STOCK_ALIASES.includes(c));
  const missing = [...(nameIdx < 0 ? ["nome"] : []), ...(priceIdx < 0 ? ["preco"] : [])];
  if (missing.length > 0) return fatal("missing_columns", missing);

  const rows = records.slice(1);
  if (rows.length > CSV_MAX_ROWS) return fatal("too_many_rows");

  const items: (CatalogItem & { itemKey: string; line: number })[] = [];
  const errors: CatalogCsvRowError[] = [];
  const seen = new Map<string, number>();
  for (const { record, info } of rows) {
    const line = info.lines;
    const name = (record[nameIdx] ?? "").trim();
    const priceText = record[priceIdx] ?? "";
    const stockText = stockIdx >= 0 ? (record[stockIdx] ?? "") : "";
    const bad = (field: string, message: string, value: string) =>
      errors.push({ line, field, message, value: value.slice(0, 200) });
    if (name === "") {
      bad("nome", "Nome vazio.", name);
      continue;
    }
    if (startsWithFormula(name)) {
      bad("nome", "Nome começa com =, +, - ou @ (fórmula não é aceita).", name);
      continue;
    }
    if (name.length > 200) {
      bad("nome", "Nome com mais de 200 caracteres.", name);
      continue;
    }
    const key = catalogItemKey(name);
    if (key === "") {
      bad("nome", "Nome inválido.", name);
      continue;
    }
    const cents = parsePriceToCents(priceText);
    if (cents === null) {
      bad("preco", "Preço inválido (use 12,50 ou 12.50; maior que zero).", priceText);
      continue;
    }
    const stock = parseStockAnswer(stockText);
    if (stock === null) {
      bad("estoque", "Estoque deve ser sim, nao ou vazio.", stockText);
      continue;
    }
    const first = seen.get(key);
    if (first !== undefined) {
      bad("nome", `Item duplicado (já informado na linha ${first}).`, name);
      continue;
    }
    seen.set(key, line);
    items.push({ name, priceCents: cents, stock, itemKey: key, line });
  }
  return { ok: true, items, errors, totalRows: rows.length };
}

/** CSV baixável com os erros por linha; células neutralizadas contra fórmula. */
export function catalogErrorsToCsv(errors: readonly CatalogCsvRowError[]): string {
  const cell = (v: string): string => `"${neutralizeFormula(v).replace(/"/g, '""')}"`;
  const lines = ["linha,campo,erro,valor"];
  for (const e of errors) lines.push([String(e.line), cell(e.field), cell(e.message), cell(e.value)].join(","));
  return `${lines.join("\r\n")}\r\n`;
}
