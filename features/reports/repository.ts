import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ReportError } from "./errors";
import {
  REPORT_REASONS,
  REPORT_RESOLUTIONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type CreateReportInput,
  type ReportQueueFilter,
  type ReportView,
  type ResolveReportInput,
} from "./ports";

/**
 * Leitura e escrita de `reports` pelo client de SESSÃO (RLS decide quem vê o quê; a tabela não tem coluna
 * sensível a mais que a política já não cubra — sem necessidade do client de serviço, ao contrário de
 * features/claims e features/payouts). O estado (transição/resolução) é sempre validado de novo pelo gatilho
 * `reports_guard` (0604); este repositório não confia só no Zod da camada de cima.
 */

function mapError(e: { code?: string; message: string }, what: string): ReportError {
  switch (e.code) {
    case "PGRST116": // PostgREST: 0 linhas em .single()
      return new ReportError(`${what}: denúncia não encontrada`, "not_found", e.code);
    case "23514":
    case "42501":
      return new ReportError(`${what}: transição não permitida`, "invalid_state", e.code);
    case "22023":
    case "23503":
      return new ReportError(`${what}: dados inválidos`, "invalid_input", e.code);
    default:
      return new ReportError(`${what}: falha no banco (${e.code ?? "sem código"})`, "database", e.code);
  }
}

const rowSchema = z.object({
  id: z.uuid(),
  target_type: z.enum(REPORT_TARGET_TYPES),
  target_id: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  detail_code: z.string().nullable(),
  reporter_id: z.uuid(),
  status: z.enum(REPORT_STATUSES),
  resolution: z.enum(REPORT_RESOLUTIONS).nullable(),
  resolution_note: z.string().nullable(),
  resolved_by: z.uuid().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

function toView(r: z.infer<typeof rowSchema>): ReportView {
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    detailCode: r.detail_code,
    reporterId: r.reporter_id,
    status: r.status,
    resolution: r.resolution,
    resolutionNote: r.resolution_note,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    createdAt: new Date(r.created_at),
  };
}

const SELECT = "id, target_type, target_id, reason, detail_code, reporter_id, status, resolution, resolution_note, resolved_by, resolved_at, created_at";

export function createReportsRepository(client: SupabaseClient) {
  return {
    async create(input: CreateReportInput & { reporterId: string }): Promise<string> {
      const { data, error } = await client
        .from("reports")
        .insert({
          target_type: input.targetType,
          target_id: input.targetId,
          reason: input.reason,
          detail_code: input.detailCode ?? null,
          reporter_id: input.reporterId,
        })
        .select("id")
        .single();
      if (error) throw mapError(error, "criar denúncia");
      return z.uuid().parse((data as { id: string }).id);
    },

    async listQueue(filter: ReportQueueFilter, limit = 100): Promise<ReportView[]> {
      let q = client.from("reports").select(SELECT).order("created_at", { ascending: false }).limit(limit);
      if (filter.status?.length) q = q.in("status", filter.status as string[]);
      const { data, error } = await q;
      if (error) throw mapError(error, "listar fila de denúncias");
      return (data ?? []).map((r) => toView(rowSchema.parse(r)));
    },

    async getById(id: string): Promise<ReportView | null> {
      const { data, error } = await client.from("reports").select(SELECT).eq("id", id).maybeSingle();
      if (error) throw mapError(error, "buscar denúncia");
      return data ? toView(rowSchema.parse(data)) : null;
    },

    async resolve(input: ResolveReportInput & { resolvedBy: string }): Promise<void> {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.status === "resolved" || input.status === "dismissed") {
        patch.resolution = input.resolution ?? null;
        patch.resolution_note = input.resolutionNote ?? null;
        patch.resolved_by = input.resolvedBy;
        patch.resolved_at = new Date().toISOString();
      }
      const { error } = await client.from("reports").update(patch).eq("id", input.reportId);
      if (error) throw mapError(error, "resolver denúncia");
    },
  };
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>;
