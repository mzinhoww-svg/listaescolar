import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { BILLING_ERROR_CODES, BillingError, type BillingErrorCode } from "./errors";

/**
 * D-158 (S19): `repository.ts` tinha 603 linhas (plano + carteira + extrato/faturas/passes + escritas de
 * cobrança). Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do D-057 (S18):
 * `repository-plans.ts`, `repository-wallet.ts`, `repository-statement.ts`, `repository-charges.ts` e este
 * arquivo (erro/guarda comuns). `repository.ts` continua sendo o ÚNICO ponto de import
 * (`@/features/billing/repository`) — reexporta tudo dos irmãos e mantém só `createBillingStore`.
 */

const HINT_CODES: ReadonlySet<string> = new Set<BillingErrorCode>(BILLING_ERROR_CODES.filter((c) => c !== "database" && c !== "payments_unavailable"));

export function dbErrorCode(error: { code?: string; hint?: string | null }): BillingErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as BillingErrorCode;
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

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: BillingErrorCode): never {
  throw new BillingError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new BillingError("ator não vem da sessão", "forbidden");
}

export async function requireMemberOrAdmin(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<void> {
  requireActor(actor);
  if (actor.role === "admin") return;
  const { data, error } = await admin
    .from("stationery_members")
    .select("profile_id")
    .eq("stationery_id", stationeryId)
    .eq("profile_id", actor.userId)
    .maybeSingle();
  if (error) fail("conferir posse da papelaria", error);
  if (!data) throw new BillingError("ator não é membro desta papelaria", "forbidden");
}

export async function requireAdmin(actor: SessionActor): Promise<void> {
  requireActor(actor);
  if (actor.role !== "admin") throw new BillingError("só a equipe administra planos", "forbidden");
}
