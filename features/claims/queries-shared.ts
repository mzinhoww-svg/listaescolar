import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { ClaimRepositoryError, createClaimsRepository, type ClaimsRepository } from "./repository";
import { createSupabaseEvidenceStorage } from "./evidence-storage";
import type { SenderEnv } from "./senders";
import { CLAIM_METHODS, CLAIM_STATUSES } from "./state";
import type { ClaimEventView, ClaimView, EvidenceView } from "./types";

/**
 * Peças compartilhadas entre `queries.ts` (leituras do próprio reivindicante) e `queries-admin.ts` (fila e visão
 * do admin), extraídas para um terceiro arquivo (D-057, S18) para os dois lados poderem importar sem criar
 * import circular entre si (um dependia do outro quando as peças compartilhadas viviam em `queries.ts`, que por
 * sua vez reexportava de `queries-admin.ts` — `claimRow`/`status` ficavam `undefined` na ordem de inicialização
 * do módulo). Nenhum caminho de import externo aponta para este arquivo; ele é um detalhe interno da pasta.
 */
export type Deps = { session?: SupabaseClient; admin?: SupabaseClient; repo?: ClaimsRepository; env?: SenderEnv };

const forbidden = () => new ClaimRepositoryError("forbidden", "consulta: forbidden");
export function requireActor(actor: unknown): asserts actor is SessionActor {
  if (!isSessionActor(actor)) throw forbidden();
}
export function requireAdmin(actor: unknown): asserts actor is SessionActor {
  requireActor(actor);
  if (actor.role !== "admin") throw forbidden();
}
export const adminRepo = (deps: Deps, admin: SupabaseClient): ClaimsRepository =>
  deps.repo ?? createClaimsRepository(admin, { storage: createSupabaseEvidenceStorage(admin) });

export const status = z.enum(CLAIM_STATUSES);
export const CLAIM_COLUMNS =
  "id, school_id, method, status, claimant_name, claimant_role_title, evidence_note, channel_confirmed_at, decision_reason, decided_at, is_demo, created_at";
export const claimRow = z.object({
  id: z.uuid(),
  school_id: z.uuid(),
  method: z.enum(CLAIM_METHODS),
  status,
  claimant_name: z.string(),
  claimant_role_title: z.string(),
  evidence_note: z.string().nullable(),
  channel_confirmed_at: z.string().nullable(),
  decision_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
  is_demo: z.boolean(),
  created_at: z.string(),
});
const eventRow = z.object({
  from_status: status.nullable(),
  to_status: status,
  actor_kind: z.enum(["claimant", "admin", "system"]),
  reason: z.string().nullable(),
  created_at: z.string(),
});
const evidenceRow = z.object({ id: z.uuid(), original_name: z.string(), mime_type: z.string(), size_bytes: z.number(), created_at: z.string() });
const EVENT_COLUMNS = "from_status, to_status, actor_kind, reason, created_at";
const EVIDENCE_COLUMNS = "id, original_name, mime_type, size_bytes, created_at";

export const toClaimView = (r: z.infer<typeof claimRow>): ClaimView => ({
  id: r.id,
  schoolId: r.school_id,
  method: r.method,
  status: r.status,
  claimantName: r.claimant_name,
  claimantRoleTitle: r.claimant_role_title,
  evidenceNote: r.evidence_note,
  channelConfirmedAt: r.channel_confirmed_at,
  decisionReason: r.decision_reason,
  decidedAt: r.decided_at,
  isDemo: r.is_demo,
  createdAt: r.created_at,
});
const toEvent = (r: z.infer<typeof eventRow>): ClaimEventView => ({
  fromStatus: r.from_status,
  toStatus: r.to_status,
  actorKind: r.actor_kind,
  reason: r.reason,
  createdAt: r.created_at,
});
const toEvidence = (r: z.infer<typeof evidenceRow>): EvidenceView => ({
  id: r.id,
  originalName: r.original_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
});

export async function eventsAndEvidence(client: SupabaseClient, claimId: string) {
  const [ev, docs] = await Promise.all([
    client.from("claim_status_events").select(EVENT_COLUMNS).eq("claim_id", claimId).order("created_at").order("id"),
    client.from("claim_evidence").select(EVIDENCE_COLUMNS).eq("claim_id", claimId).order("created_at").order("id"),
  ]);
  if (ev.error || docs.error) throw new ClaimRepositoryError("database", "consulta: database");
  return { events: z.array(eventRow).parse(ev.data).map(toEvent), evidence: z.array(evidenceRow).parse(docs.data).map(toEvidence) };
}
