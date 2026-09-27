import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { createAdminClient } from "@/lib/supabase/admin";

import { ClaimRepositoryError } from "./errors";
import { CLAIM_COLUMNS, adminRepo, claimRow, eventsAndEvidence, requireAdmin, status, type Deps } from "./queries-shared";
import { claimQueueFilterSchema, uuidSchema, type ClaimQueueFilter } from "./schemas";
import { CLAIM_METHODS, OPEN_CLAIM_STATUSES } from "./state";
import { verificationStatusSchema, type AdminClaimView, type QueueRow } from "./types";

/**
 * Visões do ADMIN sobre reivindicações, extraídas de `queries.ts` (D-057, S18): fila (`listClaimQueue`) e visão
 * completa (`getClaimForAdmin`). Reexportadas por `queries.ts` — comportamento e caminho de import (`@/features/
 * claims/queries`) inalterados para quem chama.
 */

const queueRow = z.object({
  id: z.uuid(),
  status,
  method: z.enum(CLAIM_METHODS),
  claimant_name: z.string(),
  claimant_role_title: z.string(),
  contact_email: z.string(),
  channel_confirmed_at: z.string().nullable(),
  submitted_at: z.string().nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
  evidence_note: z.string().nullable(),
  schools: z.object({ inep: z.string(), name: z.string(), verification_status: verificationStatusSchema }),
  claim_evidence: z.array(z.object({ count: z.number() })),
});

/** Fila do admin: abertas por padrão, mais antigas primeiro. Expira tokens vencidos antes de listar. */
export async function listClaimQueue(actor: SessionActor, filter: ClaimQueueFilter = {}, deps: Deps = {}): Promise<QueueRow[]> {
  requireAdmin(actor);
  const f = claimQueueFilterSchema.parse(filter);
  const admin = deps.admin ?? createAdminClient();
  await adminRepo(deps, admin).expireTokens(actor);
  const q = admin
    .from("claims")
    .select(
      "id, status, method, claimant_name, claimant_role_title, contact_email, channel_confirmed_at, submitted_at, created_at, is_demo, evidence_note, schools!inner(inep, name, verification_status), claim_evidence(count)",
    )
    .order("created_at", { ascending: true })
    .limit(f.limit);
  const { data, error } = await (f.status ? q.eq("status", f.status) : q.in("status", [...OPEN_CLAIM_STATUSES]));
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  return z.array(queueRow).parse(data).map((r) => ({
    id: r.id,
    status: r.status,
    method: r.method,
    claimantName: r.claimant_name,
    claimantRoleTitle: r.claimant_role_title,
    contactEmail: r.contact_email,
    channelConfirmedAt: r.channel_confirmed_at,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    isDemo: r.is_demo,
    evidenceCount: r.claim_evidence[0]?.count ?? 0,
    evidenceNote: r.evidence_note,
    school: { inep: r.schools.inep, name: r.schools.name, verificationStatus: r.schools.verification_status },
  }));
}

const adminRow = claimRow.extend({
  claimant_id: z.uuid(),
  contact_email: z.string(),
  submitted_at: z.string().nullable(),
  schools: z.object({ id: z.uuid(), inep: z.string(), name: z.string(), verification_status: verificationStatusSchema }),
});

/** Visão completa do admin (motivo, linha do tempo, evidências). Sem `actor_id`, sem contato da escola. */
export async function getClaimForAdmin(actor: SessionActor, claimId: string, deps: Deps = {}): Promise<AdminClaimView | null> {
  requireAdmin(actor);
  if (!uuidSchema.safeParse(claimId).success) return null;
  const admin = deps.admin ?? createAdminClient();
  await adminRepo(deps, admin).expireTokens(actor, claimId);
  const { data, error } = await admin
    .from("claims")
    .select(`${CLAIM_COLUMNS}, claimant_id, contact_email, submitted_at, schools!inner(id, inep, name, verification_status)`)
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  if (!data) return null;
  const r = adminRow.parse(data);
  const extra = await eventsAndEvidence(admin, claimId);
  return {
    id: r.id,
    status: r.status,
    method: r.method,
    claimantName: r.claimant_name,
    claimantRoleTitle: r.claimant_role_title,
    contactEmail: r.contact_email,
    channelConfirmedAt: r.channel_confirmed_at,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    isDemo: r.is_demo,
    evidenceCount: extra.evidence.length,
    evidenceNote: r.evidence_note,
    decisionReason: r.decision_reason,
    decidedAt: r.decided_at,
    school: { id: r.schools.id, inep: r.schools.inep, name: r.schools.name, verificationStatus: r.schools.verification_status },
    ...extra,
  };
}
