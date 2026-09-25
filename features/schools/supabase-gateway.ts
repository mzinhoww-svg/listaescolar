import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { createSchoolsRepository, type AdminGateway } from "./repository";
import type { SchoolsImportRepository } from "./ports";

const BATCH_COLUMNS =
  "id,status,is_demo,total_rows,inserted_count,updated_count,duplicate_count,rejected_count,unchanged_count,file_errors";

/** Gateway real: supabase-js com a chave secreta (só servidor). */
export function createSupabaseGateway(client = createAdminClient()): AdminGateway {
  return {
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    },
    async finishBatch(batchId, status, fileErrors) {
      const { error } = await client
        .from("import_batches")
        .update({ status, finished_at: new Date().toISOString(), file_errors: status === "failed" ? fileErrors : [] })
        .eq("id", batchId)
        .neq("status", "completed");
      if (error) throw new Error(`import_batches update: ${error.message}`);
    },
    async selectBatch(batchId) {
      const { data, error } = await client.from("import_batches").select(BATCH_COLUMNS).eq("id", batchId).maybeSingle();
      if (error) throw new Error(`import_batches select: ${error.message}`);
      return data;
    },
    async selectErrorRows(batchId, offset, limit) {
      const { data, error } = await client
        .from("import_rows")
        .select("row_number,action,errors,raw")
        .eq("batch_id", batchId)
        .or("action.eq.rejected,and(action.eq.duplicate,unchanged.eq.false)")
        .order("row_number")
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`import_rows select: ${error.message}`);
      return data ?? [];
    },
    async countWarningRows(batchId) {
      const { count, error } = await client
        .from("import_rows")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .or('errors.cs.[{"code":"municipality_changed"}],errors.cs.[{"code":"municipality_change_ignored"}]');
      if (error) throw new Error(`import_rows warnings: ${error.message}`);
      return count ?? 0;
    },
    async countSchools() {
      const one = async (demo: boolean) => {
        const { count, error } = await client
          .from("schools")
          .select("id", { count: "exact", head: true })
          .eq("is_demo", demo);
        if (error) throw new Error(`schools count: ${error.message}`);
        return count ?? 0;
      };
      const [real, demo] = await Promise.all([one(false), one(true)]);
      return { real, demo };
    },
  };
}

export function createSupabaseSchoolsRepository(): SchoolsImportRepository {
  return createSchoolsRepository(createSupabaseGateway());
}
