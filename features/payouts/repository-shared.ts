import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { PAYOUT_ERROR_CODES, PayoutError, type PayoutErrorCode } from "./errors";

/**
 * D-158 (S19): `repository.ts` tinha 533 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão
 * do D-057 (S18): este arquivo (erro/guarda comuns), `repository-settings.ts`, `repository-sales.ts`,
 * `repository-batches.ts`, `repository-performance.ts`. `repository.ts` continua sendo o ÚNICO ponto de import
 * (`@/features/payouts/repository`) — reexporta tudo dos irmãos e mantém só `createPayoutStore`.
 */

const HINT_CODES: ReadonlySet<string> = new Set<PayoutErrorCode>(PAYOUT_ERROR_CODES.filter((c) => c !== "database"));

export function dbErrorCode(error: { code?: string; hint?: string | null }): PayoutErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as PayoutErrorCode;
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

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: PayoutErrorCode): never {
  throw new PayoutError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new PayoutError("ator não vem da sessão", "forbidden");
}

/** Admin ou o próprio sistema (S23 não tem leitura para stationery_member: as telas são só do admin). */
export function requireAdmin(actor: SessionActor): void {
  requireActor(actor);
  if (actor.role !== "admin") throw new PayoutError("só a equipe administra comissão e repasses", "forbidden");
}

/** Mesmo predicado de posse usado em `features/billing/repository.ts` (requireMemberOrAdmin): admin OU vínculo em `stationery_members`. */
export async function requireStationeryAccess(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<void> {
  requireActor(actor);
  if (actor.role === "admin") return;
  const { data, error } = await admin.from("stationery_members").select("stationery_id").eq("stationery_id", stationeryId).eq("profile_id", actor.userId).maybeSingle();
  if (error) fail("conferir vínculo com a papelaria", error);
  if (!data) throw new PayoutError("ator não é membro desta papelaria", "forbidden");
}

export function maskPixKey(key: string | null): string | null {
  if (!key) return null;
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}
