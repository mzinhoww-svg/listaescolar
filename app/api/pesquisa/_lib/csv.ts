import type { SurveyLeadRow, SurveyResponseRow } from "@/lib/pesquisa/repositorio";

const BOM = "﻿";

/** Ordem das telas 1 a 12, na ordem da spec (seção 5.2 / 8). */
const RESPOSTAS_COLUNAS = [
  "cidade",
  "filhos",
  "rede",
  "escola",
  "etapas",
  "recebimento",
  "onde_comprou",
  "gasto",
  "tempo",
  "comparou",
  "dores",
  "usaria",
  "canal",
  "compra_ideal",
  "pode_citar",
] as const;

const RESPOSTAS_METADADOS = ["source_group", "started_at", "completed_at", "last_step"] as const;

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(";");
  return String(value);
}

function toRow(cells: unknown[]): string {
  return cells.map((c) => escapeCsvField(toCell(c))).join(",");
}

export function respostasToCsv(rows: SurveyResponseRow[]): string {
  const header = [...RESPOSTAS_COLUNAS, ...RESPOSTAS_METADADOS];
  const lines = [toRow(header)];
  for (const row of rows) {
    const answerCells = RESPOSTAS_COLUNAS.map((id) => row.answers[id]);
    const metaCells = [row.source_group, row.started_at, row.completed_at, row.last_step];
    lines.push(toRow([...answerCells, ...metaCells]));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

const LEADS_COLUNAS = ["name", "whatsapp_e164", "consent_at", "source_group"] as const;

export function leadsToCsv(rows: SurveyLeadRow[]): string {
  const lines = [toRow([...LEADS_COLUNAS])];
  for (const row of rows) {
    lines.push(toRow(LEADS_COLUNAS.map((c) => row[c])));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}
