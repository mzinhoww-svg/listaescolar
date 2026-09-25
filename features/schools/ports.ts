/** Tipos compartilhados e porta de persistência da importação INEP (S03). Sem dependência de infraestrutura. */

export type RowError = { code: string; message: string };
export type FileError = { code: string; message: string; column?: string };

export type BatchStatus = "pending" | "processing" | "completed" | "failed";
export type RowAction = "inserted" | "updated" | "duplicate" | "rejected";

export type Totals = { inserted: number; updated: number; duplicate: number; rejected: number };
export type BatchTotals = Totals & { total: number };

export type ClaimInput = { fileHash: string; fileName: string; importedBy: string | null; isDemo: boolean };
export type ClaimResult = { batchId: string; alreadyExisted: boolean; status: BatchStatus };
export type BatchInfo = { batchId: string; status: BatchStatus; totals: BatchTotals; isDemo: boolean };

/** Linha enviada a `import_apply_rows` (chaves em snake_case, como a função SQL espera). */
export type ApplyRow = {
  row_number: number;
  inep: string | null;
  name: string | null;
  normalized_name?: string;
  network?: string;
  neighborhood?: string | null;
  address?: string | null;
  cep?: string | null;
  phone?: string | null;
  email?: string | null;
  ibge_code?: string | null;
  is_demo: boolean;
  raw: Record<string, string>;
  errors?: RowError[];
};

export type ErrorRow = {
  rowNumber: number;
  action: "duplicate" | "rejected";
  errors: RowError[];
  raw: Record<string, unknown> | null;
};

export interface SchoolsImportRepository {
  /** Insere o lote ou devolve o existente para o mesmo hash (seguro sob concorrência). */
  claimBatch(input: ClaimInput): Promise<ClaimResult>;
  getBatch(batchId: string): Promise<BatchInfo | null>;
  /** Aplica linhas já validadas; idempotente por (lote, row_number). Devolve o que está gravado para essas linhas. */
  applyRows(batchId: string, rows: ApplyRow[]): Promise<Totals>;
  finishBatch(batchId: string, totals: BatchTotals, status: "completed" | "failed"): Promise<void>;
  getErrorRows(batchId: string): Promise<ErrorRow[]>;
  countSchools(): Promise<number>;
}

export type ImportResult = {
  batchId: string;
  alreadyExisted: boolean;
  status: BatchStatus;
  totals: BatchTotals;
  fileErrors: FileError[];
};
