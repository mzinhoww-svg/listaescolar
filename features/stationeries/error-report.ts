import { catalogErrorsToCsv, type CatalogCsvRowError } from "./catalog-csv";

export const ERROR_REPORT_FILENAME = "erros-catalogo.csv";

/**
 * Relatório baixável dos erros da planilha. O CSV já neutraliza células que o Excel leria como fórmula
 * (`= + - @`); o BOM só ajuda o Excel a abrir os acentos.
 */
export function buildErrorReport(errors: readonly CatalogCsvRowError[]): { filename: string; csv: string; href: string } {
  const csv = catalogErrorsToCsv(errors);
  return {
    filename: ERROR_REPORT_FILENAME,
    csv,
    href: `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`,
  };
}
