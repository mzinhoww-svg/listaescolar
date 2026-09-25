import type { ErrorRow, RowError } from "./ports";
import { INEP_COLUMNS } from "./schemas";

const MESSAGES: Record<string, string> = {
  invalid_inep: "INEP inválido (8 dígitos).",
  invalid_name: "Nome da escola vazio.",
  invalid_network: "Rede (TP_DEPENDENCIA) inválida.",
  invalid_municipality: "Código de município inválido (7 dígitos).",
  invalid_row: "Linha inválida.",
  duplicate_inep_in_file: "INEP repetido no mesmo arquivo.",
  duplicate_inep: "INEP repetido no arquivo ou já cadastrado com outros dados.",
  duplicate_name_municipality: "Já existe escola com o mesmo nome no município.",
  municipality_not_enabled: "Município não habilitado para o piloto.",
  demo_real_conflict: "Conflito entre dado de demonstração e dado real; a escola existente não foi alterada.",
  municipality_change_ignored: "Escola já reivindicada ou verificada: mudança de município ignorada.",
  municipality_changed: "Município da escola atualizado conforme o arquivo.",
  field_too_long: "Campo acima do tamanho máximo permitido.",
  already_up_to_date: "Escola já estava igual ao arquivo.",
  processing_failed: "Falha ao processar o arquivo.",
};

/** Mensagem legível em português para códigos conhecidos; código cru para os desconhecidos. */
export function describeErrorCode(code: string): string {
  return MESSAGES[code] ?? code;
}

export function describeError(e: RowError): string {
  return MESSAGES[e.code] ?? (e.message ? `${e.code}: ${e.message}` : e.code);
}

/** Neutraliza injeção de fórmula: células iniciadas por = + - @ tab ou CR ganham prefixo `'`. */
export function neutralizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : String(value);
  const safe = neutralizeCell(text);
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const ACTION_LABEL: Record<ErrorRow["action"], string> = { rejected: "Rejeitada", duplicate: "Duplicada" };

/** CSV (separador `;`, BOM para Excel) com uma linha por erro de linha do lote. */
export function buildErrorReportCsv(rows: ErrorRow[]): string {
  const header = ["linha", "situacao", "codigo", "mensagem", ...INEP_COLUMNS];
  const lines = [header.join(";")];
  for (const row of rows) {
    const errors = row.errors.length > 0 ? row.errors : [{ code: "sem_detalhe", message: "" }];
    const raw = row.raw ?? {};
    for (const e of errors) {
      lines.push(
        [row.rowNumber, ACTION_LABEL[row.action], e.code, describeError(e), ...INEP_COLUMNS.map((c) => raw[c])]
          .map(csvCell)
          .join(";"),
      );
    }
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Nome de arquivo seguro para Content-Disposition (só ASCII simples). */
export function safeReportFileName(batchId: string): string {
  return `erros-importacao-${batchId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36)}.csv`;
}
