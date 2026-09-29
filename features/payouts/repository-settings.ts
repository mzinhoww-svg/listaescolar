import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { PayoutSettingsView, PayoutTarget, PixKeyKind, SchoolPayoutConfigView } from "./ports";
import { fail, maskPixKey, requireActor, requireAdmin } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

const settingsRow = z.object({ id: z.uuid(), commission_bps: z.number().int(), grace_days: z.number().int(), block_days: z.number().int(), created_at: z.string() });

export async function getActiveSettings(admin: SupabaseClient): Promise<PayoutSettingsView | null> {
  const { data, error } = await admin.from("payout_settings").select("*").eq("status", "active").maybeSingle();
  if (error) fail("ler comissão vigente", error);
  if (!data) return null;
  const r = settingsRow.parse(data);
  return { id: r.id, commissionBps: r.commission_bps, graceDays: r.grace_days, blockDays: r.block_days, createdAt: new Date(r.created_at) };
}

export async function publishSettings(admin: SupabaseClient, actor: SessionActor, input: { commissionBps: number; graceDays: number; blockDays: number }): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_settings_publish", {
    p_actor_id: actor.userId,
    p_commission_bps: input.commissionBps,
    p_grace_days: input.graceDays,
    p_block_days: input.blockDays,
  });
  if (error) fail("publicar comissão", error);
  return z.uuid().parse(data);
}

const schoolConfigRow = z.object({
  id: z.uuid(),
  school_id: z.uuid(),
  target: z.enum(["none", "school", "apm"]),
  payout_bps: z.number().int(),
  beneficiary_name: z.string().nullable(),
  pix_key: z.string().nullable(),
  pix_key_kind: z.enum(["cpf", "cnpj", "email", "phone", "random"]).nullable(),
  created_at: z.string(),
});

export async function listSchoolConfigs(admin: SupabaseClient, actor: SessionActor): Promise<SchoolPayoutConfigView[]> {
  requireAdmin(actor);
  const { data, error } = await admin.from("school_payout_settings").select("*, schools(name)").eq("status", "active").order("created_at", { ascending: false });
  if (error) fail("listar repasses de escola", error);
  const rows = z.array(schoolConfigRow.extend({ schools: z.object({ name: z.string() }).nullable() })).parse(data ?? []);
  return rows.map((r) => ({
    id: r.id,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? "Escola",
    target: r.target as PayoutTarget,
    payoutBps: r.payout_bps,
    beneficiaryName: r.beneficiary_name,
    pixKeyKind: r.pix_key_kind as PixKeyKind | null,
    pixKeyMasked: maskPixKey(r.pix_key),
    createdAt: new Date(r.created_at),
  }));
}

export async function publishSchoolConfig(
  admin: SupabaseClient,
  actor: SessionActor,
  input: { schoolId: string; target: PayoutTarget; payoutBps: number; beneficiaryName: string | null; pixKey: string | null; pixKeyKind: PixKeyKind | null },
): Promise<string> {
  requireAdmin(actor);
  const { data, error } = await admin.rpc("payout_school_config_publish", {
    p_actor_id: actor.userId,
    p_school_id: input.schoolId,
    p_target: input.target,
    p_payout_bps: input.payoutBps,
    p_beneficiary_name: input.beneficiaryName,
    p_pix_key: input.pixKey,
    p_pix_key_kind: input.pixKeyKind,
  });
  if (error) fail("publicar repasse de escola", error);
  return z.uuid().parse(data);
}

/**
 * Nome e id da escola não são dado sensível (já públicos em `/escolas/[inep]`, S04): qualquer ator autenticado pode
 * listar, não só admin — é isso que deixa a papelaria escolher a escola certa ao confirmar "Pix pela plataforma"
 * (Pap03), sem depender de resolução automática por `leads.list_id` (que não tem FK, ver Ruling do cabeçalho).
 */
export async function listSchoolOptions(admin: SupabaseClient, actor: SessionActor): Promise<{ id: string; name: string }[]> {
  requireActor(actor);
  const { data, error } = await admin.from("schools").select("id, name").order("name").limit(500);
  if (error) fail("listar escolas", error);
  return z.array(z.object({ id: z.uuid(), name: z.string() })).parse(data ?? []);
}
