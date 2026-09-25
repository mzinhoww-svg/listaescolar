import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { createSupabaseSchoolsRepository } from "./supabase-gateway";

const batchListRow = z.object({
  id: z.string().uuid(),
  file_name: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  is_demo: z.boolean(),
  created_at: z.string(),
  total_rows: z.number().int(),
  inserted_count: z.number().int(),
  updated_count: z.number().int(),
  unchanged_count: z.number().int(),
  duplicate_count: z.number().int(),
  rejected_count: z.number().int(),
});
export type BatchListItem = z.infer<typeof batchListRow>;

export async function listBatches(limit = 50): Promise<BatchListItem[]> {
  const { data, error } = await createAdminClient()
    .from("import_batches")
    .select(
      "id,file_name,status,is_demo,created_at,total_rows,inserted_count,updated_count,unchanged_count,duplicate_count,rejected_count",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`import_batches list: ${error.message}`);
  return z.array(batchListRow).parse(data ?? []);
}

export const countSchools = () => createSupabaseSchoolsRepository().countSchools();
export const getBatch = (id: string) => createSupabaseSchoolsRepository().getBatch(id);
export const countWarningRows = (id: string) => createSupabaseSchoolsRepository().countWarningRows(id);
export const getErrorRows = (id: string) => createSupabaseSchoolsRepository().getErrorRows(id);
