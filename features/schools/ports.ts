/** Tipos compartilhados e porta de persistência da importação INEP (S03). Sem dependência de infraestrutura. */

export type RowError = { code: string; message: string };
export type FileError = { code: string; message: string; column?: string };

export type BatchStatus = "pending" | "processing" | "completed" | "failed";
export type RowAction = "inserted" | "updated" | "duplicate" | "rejected";

/** `unchanged`: escola já igual ao arquivo (gravada como duplicate/already_up_to_date, contada à parte). */
export type Totals = { inserted: number; updated: number; duplicate: number; rejected: number; unchanged: number };
export type BatchTotals = Totals & { total: number };

export type ClaimInput = { fileHash: string; fileName: string; importedBy: string | null; isDemo: boolean };
/** `owner`: só quem recebe true pode processar o lote (claim atômico); `isDemo` é a natureza já gravada no lote. */
export type ClaimResult = { batchId: string; alreadyExisted: boolean; status: BatchStatus; owner: boolean; isDemo: boolean };
export type BatchInfo = {
  batchId: string;
  status: BatchStatus;
  totals: BatchTotals;
  isDemo: boolean;
  /** Erros do arquivo gravados ao fechar o lote como `failed` (vazio nos demais casos). */
  fileErrors: FileError[];
};

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
  /** Claim atômico por hash: lote novo, `pending`/`failed` ou `processing` parado há mais de 10 min viram do chamador (`owner`). */
  claimBatch(input: ClaimInput): Promise<ClaimResult>;
  getBatch(batchId: string): Promise<BatchInfo | null>;
  /** Aplica linhas já validadas; idempotente por (lote, row_number). Devolve o que está gravado para essas linhas. */
  applyRows(batchId: string, rows: ApplyRow[]): Promise<Totals>;
  /** Só status/finished_at (+ `file_errors` quando `failed`), nunca sobre lote `completed`; os contadores já são de `applyRows`. */
  finishBatch(batchId: string, status: "completed" | "failed", fileErrors?: FileError[]): Promise<void>;
  /** Todas as linhas com problema (relatório erros.csv). */
  getErrorRows(batchId: string): Promise<ErrorRow[]>;
  /** Só as primeiras `limit` linhas com problema (pré-visualização); o total é `rejected + duplicate` do lote. */
  getErrorRowsPreview(batchId: string, limit: number): Promise<ErrorRow[]>;
  /** Linhas gravadas com aviso (município alterado ou mantido). */
  countWarningRows(batchId: string): Promise<number>;
  countSchools(): Promise<SchoolCounts>;
}

export type SchoolCounts = { real: number; demo: number };

export type ImportResult = {
  batchId: string;
  alreadyExisted: boolean;
  /** true quando um lote `failed`/`pending`/`processing` parado foi retomado por esta chamada. */
  resumed: boolean;
  status: BatchStatus;
  totals: BatchTotals;
  fileErrors: FileError[];
};
