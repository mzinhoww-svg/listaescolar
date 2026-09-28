import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { DelinquencyRow, PayoutBatchView, PendingRepasseView } from "./ports";
import { fail, requireAdmin } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

export async function listPendingRepasses(admin: SupabaseClient, actor: SessionActor): Promise<PendingRepasseView[]> {
  requireAdmin(actor);
  const { data, error } = await admin.from("payout_ledger").select("beneficiary_type, beneficiary_id, amount_cents").in("entry_type", ["repasse_due", "repasse_settled", "repasse_reversed"]);
  if (error) fail("apurar repasse pendente", error);
  const rows = z.array(z.object({ beneficiary_type: z.enum(["school", "apm"]), beneficiary_id: z.uuid(), amount_cents: z.number().int() })).parse(data ?? []);
  const byKey = new Map<string, { beneficiaryType: "school" | "apm"; schoolId: string; pendingCents: number }>();
  for (const r of rows) {
    const key = `${r.beneficiary_type}:${r.beneficiary_id}`;
    const prev = byKey.get(key) ?? { beneficiaryType: r.beneficiary_type, schoolId: r.beneficiary_id, pendingCents: 0 };
    prev.pendingCents += r.amount_cents;
    byKey.set(key, prev);
  }
  const pending = [...byKey.values()].filter((v) => v.pendingCents > 0);
  if (pending.length === 0) return [];
  const schoolIds = [...new Set(pending.map((p) => p.schoolId))];
  const { data: schoolsData, error: schoolsErr } = await admin.from("schools").select("id, name").in("id", schoolIds);
  if (schoolsErr) fail("ler nomes de escola", schoolsErr);
  const names = new Map(z.array(z.object({ id: z.uuid(), name: z.string() })).parse(schoolsData ?? []).map((s) => [s.id, s.name]));
  return pending
    .map((p) => ({ beneficiaryType: p.beneficiaryType, schoolId: p.schoolId, schoolName: names.get(p.schoolId) ?? "Escola", pendingCents: p.pendingCents }))
    .sort((a, b) => b.pendingCents - a.pendingCents);
}

const batchRow = z.object({
  id: z.uuid(),
  beneficiary_type: z.enum(["school", "apm"]),
  school_id: z.uuid(),
  total_cents: z.number().int(),
  status: z.enum(["pending", "executed"]),
  created_at: z.string(),
  executed_at: z.string().nullable(),
  schools: z.object({ name: z.string() }).nullable(),
});

export async function listBatches(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<PayoutBatchView[]> {
  requireAdmin(actor);
  const { data, error } = await admin.from("payout_batches").select("*, schools(name)").order("created_at", { ascending: false }).limit(limit);
  if (error) fail("listar lotes de repasse", error);
  return z.array(batchRow).parse(data ?? []).map((r) => ({
    id: r.id,
    beneficiaryType: r.beneficiary_type,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? "Escola",
    totalCents: r.total_cents,
    status: r.status,
    createdAt: new Date(r.created_at),
    executedAt: r.executed_at ? new Date(r.executed_at) : null,
  }));
}

export async function createBatch(admin: SupabaseClient, actor: SessionActor, input: { schoolId: string; beneficiaryType: "school" | "apm" }): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_batch_create", { p_actor_id: actor.userId, p_school_id: input.schoolId, p_beneficiary_type: input.beneficiaryType });
  if (error) fail("gerar lote de repasse", error);
  return z.uuid().parse(data);
}

export async function markBatchExecuted(admin: SupabaseClient, actor: SessionActor, batchId: string): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_batch_mark_executed", { p_actor_id: actor.userId, p_batch_id: batchId });
  if (error) fail("marcar lote como executado", error);
  return z.uuid().parse(data);
}

const delinquencyRow = z.object({
  stationery_id: z.uuid(),
  trade_name: z.string(),
  status: z.enum(["em_dia", "atraso", "pausado"]),
  days_overdue: z.number().int(),
  oldest_due_date: z.string().nullable(),
});

export async function listDelinquency(admin: SupabaseClient, actor: SessionActor): Promise<DelinquencyRow[]> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_admin_delinquency_list", { p_actor_id: actor.userId });
  if (error) fail("listar inadimplência", error);
  return z.array(delinquencyRow).parse(data ?? []).map((r) => ({
    stationeryId: r.stationery_id,
    tradeName: r.trade_name,
    status: r.status,
    daysOverdue: r.days_overdue,
    oldestDueDate: r.oldest_due_date,
  }));
}
