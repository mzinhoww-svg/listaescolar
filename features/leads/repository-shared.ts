import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { normalizeLeadCode } from "./code";
import { LeadError, type LeadErrorCode } from "./errors";
import { LEAD_STATUSES, type LeadStatus } from "./state";

/**
 * Peças compartilhadas por `repository-writes.ts`, `repository-requester.ts`, `repository-stationery.ts` e
 * `repository.ts` (D-057, S18, extraído de `repository.ts`, que tinha 632 linhas). Sem `server-only`: este
 * arquivo é só schema/erro, sem I/O — os arquivos que fazem a chamada ao banco importam `server-only` eles
 * mesmos.
 */

export const HINT_CODES: ReadonlySet<string> = new Set<LeadErrorCode>([
  "forbidden",
  "invalid_state",
  "transition_not_allowed",
  "rate_limited",
  "stationery_unavailable",
  "out_of_area",
  "expired",
  "amount_invalid",
  "reason_required",
  "actor_invalid",
  "limit_exceeded",
  "consent_required",
  "invalid_input",
  "not_found",
  "billing_required",
  "billing_unavailable",
  "delinquency_blocked",
]);

export function dbErrorCode(error: { code?: string; hint?: string | null }): LeadErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as LeadErrorCode;
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514":
      return "invalid_input";
    case "54000":
      return "limit_exceeded";
    default:
      return "database";
  }
}

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: LeadErrorCode): never {
  throw new LeadError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new LeadError("ator não vem da sessão", "forbidden");
}

export function requireCode(code: string): string {
  const normalized = normalizeLeadCode(code);
  if (normalized === null) throw new LeadError("código inválido", "not_found");
  return normalized;
}

export const statusSchema = z.enum(LEAD_STATUSES);
export const date = z.string().transform((s) => new Date(s));
export const nullableDate = z.string().nullable().transform((s) => (s === null ? null : new Date(s)));

export type LeadItemRow = { position: number; name: string; itemKey: string; quantity: number };
export type LeadEventRow = {
  id: string;
  eventType: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  actorRole: string;
  amountCents: number | null;
  /** Só na visão do solicitante (o texto do admin ao cancelar não vai para a papelaria). */
  reason?: string | null;
  createdAt: Date;
};

export const itemSchema = z.object({ position: z.number().int(), name: z.string(), item_key: z.string(), quantity: z.number().int() });
export const mapItem = (r: z.output<typeof itemSchema>): LeadItemRow => ({ position: r.position, name: r.name, itemKey: r.item_key, quantity: r.quantity });

export const eventSchema = z.object({
  id: z.uuid(),
  event_type: z.string(),
  from_status: statusSchema.nullable(),
  to_status: statusSchema.nullable(),
  actor_role: z.string(),
  amount_cents: z.number().int().nullable(),
  reason: z.string().nullable().optional(),
  created_at: date,
});
export const mapEvent = (r: z.output<typeof eventSchema>): LeadEventRow => ({
  id: r.id,
  eventType: r.event_type,
  fromStatus: r.from_status,
  toStatus: r.to_status,
  actorRole: r.actor_role,
  amountCents: r.amount_cents,
  ...(r.reason !== undefined ? { reason: r.reason } : {}),
  createdAt: r.created_at,
});
