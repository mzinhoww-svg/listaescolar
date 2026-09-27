import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

/**
 * Auditoria filtrável (Admin08-Eventos, S16). Lê `audit_log` pelo client de SESSÃO (RLS `audit_log_select_admin`,
 * S01). Nunca seleciona `ip_hash` (a coluna já é hash, nunca IP em claro — e mesmo assim fica fora da tela) e
 * filtra `entity_table <> 'students'` por defesa em profundidade (nenhum gatilho grava `students` no audit_log
 * hoje; o filtro garante que continue assim mesmo se um dia alguém adicionar um sem querer).
 */

export const auditFilterSchema = z.object({
  action: z.string().trim().min(1).max(40).optional(),
  entityTable: z.string().trim().min(1).max(63).optional(),
  entityId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;

export type AuditRow = {
  id: string;
  action: string;
  entityTable: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  actorId: string | null;
  actorRole: string | null;
  createdAt: Date;
};

const rowSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  entity_table: z.string(),
  entity_id: z.uuid().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  actor_id: z.uuid().nullable(),
  actor_role: z.string().nullable(),
  created_at: z.string(),
});

export async function searchAuditLog(actor: SessionActor, filter: AuditFilter, limit = 100): Promise<AuditRow[]> {
  if (actor.role !== "admin" && actor.role !== "system") throw new Error("forbidden");
  const client = await createClient();
  let q = client
    .from("audit_log")
    .select("id, action, entity_table, entity_id, before, after, actor_id, actor_role, created_at")
    .neq("entity_table", "students")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filter.action) q = q.eq("action", filter.action.toUpperCase());
  if (filter.entityTable) q = q.eq("entity_table", filter.entityTable);
  if (filter.entityId) q = q.eq("entity_id", filter.entityId);
  if (filter.actorId) q = q.eq("actor_id", filter.actorId);
  if (filter.since) q = q.gte("created_at", `${filter.since}T00:00:00Z`);
  if (filter.until) q = q.lte("created_at", `${filter.until}T23:59:59Z`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => {
    const p = rowSchema.parse(r);
    return {
      id: p.id,
      action: p.action,
      entityTable: p.entity_table,
      entityId: p.entity_id,
      before: p.before,
      after: p.after,
      actorId: p.actor_id,
      actorRole: p.actor_role,
      createdAt: new Date(p.created_at),
    };
  });
}
