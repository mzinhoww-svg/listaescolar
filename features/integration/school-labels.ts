import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SchoolLabel, SchoolLabelReader } from "@/features/review/school-labels";

import { callRpc, IntegrationReadError } from "./rpc";

const labelsSchema = z.record(z.string().uuid(), z.object({ name: z.string().min(1).max(300), inep: z.string().regex(/^\d{8}$/) }).strict());

/** Rótulo (nome e INEP) por id de escola: só colunas públicas, pela função `school_labels`. */
export class SupabaseSchoolLabelReader implements SchoolLabelReader {
  constructor(private readonly client: Pick<SupabaseClient, "rpc">) {}

  async labels(ids: readonly string[]): Promise<Record<string, SchoolLabel>> {
    const wanted = [...new Set(ids.filter((i) => z.string().uuid().safeParse(i).success))].slice(0, 100);
    if (wanted.length === 0) return {};
    const parsed = labelsSchema.safeParse(await callRpc(this.client, "school_labels", { p_ids: wanted }));
    if (!parsed.success) throw new IntegrationReadError("invalid_response");
    return parsed.data;
  }
}
