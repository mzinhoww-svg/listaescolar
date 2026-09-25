import "server-only";

import type {
  ApplyRow,
  BatchInfo,
  ClaimInput,
  ClaimResult,
  ErrorRow,
  SchoolCounts,
  SchoolsImportRepository,
  Totals,
} from "./ports";
import { batchRowSchema, claimResponseSchema, errorRowSchema, totalsSchema } from "./schemas";
import { z } from "zod";

/** Acesso mínimo ao banco como service_role (implementado sobre supabase-js em produção e sobre `pg` nos testes). */
export interface AdminGateway {
  rpc(fn: "import_claim_batch" | "import_apply_rows", args: Record<string, unknown>): Promise<unknown>;
  /** status + finished_at do lote, `where status <> 'completed'`; nunca toca contadores. */
  finishBatch(batchId: string, status: "completed" | "failed"): Promise<void>;
  selectBatch(batchId: string): Promise<unknown | null>;
  /** Linhas de import_rows com problema (rejected, ou duplicate com `unchanged = false`). */
  selectErrorRows(batchId: string, offset: number, limit: number): Promise<unknown[]>;
  countWarningRows(batchId: string): Promise<number>;
  countSchools(): Promise<SchoolCounts>;
}

const PAGE = 1000;

export function createSchoolsRepository(gw: AdminGateway): SchoolsImportRepository {
  return {
    async claimBatch(input: ClaimInput): Promise<ClaimResult> {
      const data = await gw.rpc("import_claim_batch", {
        p_file_hash: input.fileHash,
        p_file_name: input.fileName,
        p_imported_by: input.importedBy,
        p_is_demo: input.isDemo,
      });
      const [row] = claimResponseSchema.parse(data);
      if (!row) throw new Error("import_claim_batch sem retorno");
      return {
        batchId: row.batch_id,
        alreadyExisted: row.already_exists,
        status: row.status,
        owner: row.owner,
        isDemo: row.is_demo,
      };
    },

    async getBatch(batchId: string): Promise<BatchInfo | null> {
      const data = await gw.selectBatch(batchId);
      if (data === null) return null;
      const b = batchRowSchema.parse(data);
      return {
        batchId: b.id,
        status: b.status,
        isDemo: b.is_demo,
        totals: {
          total: b.total_rows,
          inserted: b.inserted_count,
          updated: b.updated_count,
          duplicate: b.duplicate_count,
          rejected: b.rejected_count,
          unchanged: b.unchanged_count,
        },
      };
    },

    async applyRows(batchId: string, rows: ApplyRow[]): Promise<Totals> {
      const data = await gw.rpc("import_apply_rows", { p_batch_id: batchId, p_rows: rows });
      return totalsSchema.parse(data);
    },

    finishBatch: (batchId, status) => gw.finishBatch(batchId, status),

    async getErrorRows(batchId: string): Promise<ErrorRow[]> {
      const out: ErrorRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = z.array(errorRowSchema).parse(await gw.selectErrorRows(batchId, offset, PAGE));
        for (const r of page) out.push({ rowNumber: r.row_number, action: r.action, errors: r.errors, raw: r.raw });
        if (page.length < PAGE) return out;
      }
    },

    countWarningRows: (batchId) => gw.countWarningRows(batchId),
    countSchools: () => gw.countSchools(),
  };
}
