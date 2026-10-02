import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { CONVERSION_ERROR_CODES, ConversionError, type ConversionErrorCode } from "./errors";
import type { ConversionSignals, PurchaseAnswer } from "./ports";

/**
 * D-158 (S19): `repository.ts` tinha 496 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão
 * do D-057 (S18): este arquivo (erro/guarda/sinais de conversão comuns — usados por disputas e auditoria
 * também), `repository-reviews.ts`, `repository-disputes.ts`, `repository-audit.ts`. `repository.ts` continua
 * sendo o ÚNICO ponto de import (`@/features/conversion/repository`) — só `createConversionStore` é usado por
 * fora deste diretório (conferido: nenhuma função individual é importada de fora).
 */

const HINT_CODES: ReadonlySet<string> = new Set<ConversionErrorCode>(CONVERSION_ERROR_CODES.filter((c) => c !== "database"));

export function dbErrorCode(error: { code?: string; hint?: string | null }): ConversionErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as ConversionErrorCode;
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514":
      return "invalid_input";
    default:
      return "database";
  }
}

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: ConversionErrorCode): never {
  throw new ConversionError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new ConversionError("ator não vem da sessão", "forbidden");
}

const leadRow = z.object({
  id: z.uuid(),
  code: z.string(),
  requester_id: z.uuid().nullable(),
  stationery_id: z.uuid(),
  status: z.string(),
  school_name: z.string(),
  created_at: z.string(),
});

export async function loadLead(admin: SupabaseClient, leadId: string) {
  const { data, error } = await admin
    .from("leads")
    .select("id, code, requester_id, stationery_id, status, school_name, created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (error) fail("ler pedido", error);
  if (!data) throw new ConversionError("pedido não encontrado", "not_found");
  return leadRow.parse(data);
}

export async function isStationeryMember(admin: SupabaseClient, stationeryId: string, profileId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("stationery_members")
    .select("profile_id")
    .eq("stationery_id", stationeryId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) fail("conferir posse da papelaria", error);
  return data !== null;
}

/** O ator vê o pedido: é o solicitante, é membro da papelaria dele, ou é admin/system. */
export async function requireLeadAccess(admin: SupabaseClient, actor: SessionActor, lead: { requester_id: string | null; stationery_id: string }): Promise<void> {
  requireActor(actor);
  if (actor.role === "admin" || actor.role === "system") return;
  if (lead.requester_id === actor.userId) return;
  if (await isStationeryMember(admin, lead.stationery_id, actor.userId)) return;
  throw new ConversionError("ator sem acesso a este pedido", "forbidden");
}

function toSignals(row: { stationery_confirmed: boolean; parent_confirmed: boolean; pix_confirmed: boolean; signal_count: number; confirmed: boolean }): ConversionSignals {
  return {
    stationeryConfirmed: row.stationery_confirmed,
    parentConfirmed: row.parent_confirmed,
    pixConfirmed: row.pix_confirmed,
    signalCount: row.signal_count,
    confirmed: row.confirmed,
  };
}

const signalsRow = z.object({
  stationery_confirmed: z.boolean(),
  parent_confirmed: z.boolean(),
  pix_confirmed: z.boolean(),
  signal_count: z.number().int(),
  confirmed: z.boolean(),
});

export async function fetchSignals(admin: SupabaseClient, leadId: string): Promise<ConversionSignals> {
  const { data, error } = await admin.rpc("lead_conversion_signals", { p_lead_id: leadId }).single();
  if (error) fail("calcular sinais de conversão", error);
  return toSignals(signalsRow.parse(data));
}

// ---------------------------------------------------------------------------
// lead_confirm_purchase (App22)
// ---------------------------------------------------------------------------
export async function confirmPurchase(admin: SupabaseClient, actor: SessionActor, leadId: string, answer: PurchaseAnswer): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_confirm_purchase", { p_lead_id: leadId, p_actor_id: actor.userId, p_answer: answer });
  if (error) fail("confirmar compra", error);
  return z.uuid().parse(data);
}

export async function getSignals(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<ConversionSignals> {
  const lead = await loadLead(admin, leadId);
  await requireLeadAccess(admin, actor, lead);
  return fetchSignals(admin, leadId);
}
