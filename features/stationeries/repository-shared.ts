import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "./actor";
import { neighborhoodLabel, normalizeNeighborhood } from "./neighborhood";
import { STATIONERY_STATUSES, type StationeryStatus } from "./state";

/**
 * Peças compartilhadas por `repository-profile.ts`, `repository-catalog.ts`, `repository-reads.ts` e
 * `repository.ts` (D-057, S18, extraído de `repository.ts`, que tinha 630 linhas) — comportamento idêntico ao
 * arquivo original, só a posição do código mudou.
 */

// Funções recebem o cliente de SERVIÇO (server-only) e um `SessionActor` (sessão validada no servidor; ver actor.ts).
// Como o service_role ignora a RLS, posse e estado são conferidos aqui e, nas escritas críticas, DENTRO da função SQL
// (mesma transação e trava da escrita).

export type StationeryErrorCode =
  | "cnpj_taken"
  | "already_owner"
  | "not_found"
  | "forbidden"
  | "invalid_state"
  | "transition_not_allowed"
  | "precondition_failed"
  | "actor_invalid"
  | "reason_required"
  | "consent_required"
  | "limit_exceeded"
  | "invalid_input"
  | "database";

export class StationeryRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: StationeryErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "StationeryRepositoryError";
  }
}

/** `hint` das funções SQL (estável, uma causa por valor) -> código do repositório. */
const HINT_CODES: Readonly<Record<string, StationeryErrorCode>> = {
  cnpj_taken: "cnpj_taken",
  already_owner: "already_owner",
  not_found: "not_found",
  forbidden: "forbidden",
  invalid_state: "invalid_state",
  transition_not_allowed: "transition_not_allowed",
  precondition_failed: "precondition_failed",
  actor_invalid: "actor_invalid",
  reason_required: "reason_required",
  consent_required: "consent_required",
  limit_exceeded: "limit_exceeded",
  invalid_input: "invalid_input",
};

/** Causa do erro do banco: pelo `hint` da função; sem hint, pelo SQLSTATE. */
function dbErrorCode(error: { code?: string; hint?: string | null }): StationeryErrorCode {
  if (error.hint && Object.hasOwn(HINT_CODES, error.hint)) return HINT_CODES[error.hint] ?? "database";
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514": // check de coluna violado (valor fora do permitido)
      return "invalid_input";
    case "54000":
      return "limit_exceeded";
    default:
      return "database";
  }
}

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: StationeryErrorCode): never {
  throw new StationeryRepositoryError(`${what}: ${error.message}`, code ?? dbErrorCode(error), error.code);
}

/** O ator precisa ter sido criado por `getSessionActor` (o tipo de marca não cobre `as`). */
export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new StationeryRepositoryError("ator não vem da sessão", "forbidden");
}

export const statusSchema = z.enum(STATIONERY_STATUSES);

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base === "" ? "papelaria" : base;
}

/** Bairros no formato da função SQL: chave normalizada (uma só regra) + texto de exibição. */
export function areaPayload(neighborhoods: readonly string[]): { key: string; label: string }[] {
  const byKey = new Map<string, string>();
  for (const name of neighborhoods) {
    const key = normalizeNeighborhood(name);
    if (key !== "" && !byKey.has(key)) byKey.set(key, neighborhoodLabel(name));
  }
  return [...byKey].map(([key, label]) => ({ key, label }));
}

export async function loadOwned(
  client: SupabaseClient,
  stationeryId: string,
  actorId: string,
  allowed: readonly StationeryStatus[],
): Promise<{ status: StationeryStatus; municipalityId: string }> {
  const { data, error } = await client
    .from("stationeries")
    .select("status, municipality_id, stationery_members!inner(profile_id)")
    .eq("id", stationeryId)
    .eq("stationery_members.profile_id", actorId)
    .maybeSingle();
  if (error) fail("ler papelaria", error);
  if (!data) throw new StationeryRepositoryError("papelaria não encontrada para este usuário", "forbidden");
  const row = z.object({ status: statusSchema, municipality_id: z.uuid() }).parse(data);
  if (!allowed.includes(row.status)) {
    throw new StationeryRepositoryError(`operação não permitida em ${row.status}`, "invalid_state");
  }
  return { status: row.status, municipalityId: row.municipality_id };
}
