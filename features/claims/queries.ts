import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { availableMethods } from "./channels";
import { ClaimRepositoryError, createClaimsRepository, type ClaimsRepository } from "./repository";
import { getClaimTokenSender, type SenderEnv } from "./senders";
import { claimQueueFilterSchema, inepSchema, uuidSchema, type ClaimQueueFilter } from "./schemas";
import { createSupabaseEvidenceStorage } from "./evidence-storage";
import { CLAIM_METHODS, CLAIM_STATUSES, OPEN_CLAIM_STATUSES } from "./state";
import { verificationStatusSchema, type AdminClaimView, type ClaimEventView, type ClaimStatusView, type ClaimView, type EvidenceView, type QueueRow, type SchoolClaimContext, type VerificationStatus } from "./types";

/**
 * Leituras de reivindicação. O reivindicante lê pelo cliente de SESSÃO (RLS + grants por coluna, sem `decided_by`);
 * a fila e a visão do admin usam o service role só depois de conferir `role === 'admin'` (o admin via `authenticated`
 * não lê `decided_by`/`actor_id`). Nada aqui devolve `schools.email`/`phone`, `storage_path` nem hash de token.
 */
type Deps = { session?: SupabaseClient; admin?: SupabaseClient; repo?: ClaimsRepository; env?: SenderEnv };

const forbidden = () => new ClaimRepositoryError("forbidden", "consulta: forbidden");
function requireActor(actor: unknown): asserts actor is SessionActor {
  if (!isSessionActor(actor)) throw forbidden();
}
function requireAdmin(actor: unknown): asserts actor is SessionActor {
  requireActor(actor);
  if (actor.role !== "admin") throw forbidden();
}
const adminRepo = (deps: Deps, admin: SupabaseClient): ClaimsRepository =>
  deps.repo ?? createClaimsRepository(admin, { storage: createSupabaseEvidenceStorage(admin) });

const status = z.enum(CLAIM_STATUSES);
const CLAIM_COLUMNS =
  "id, school_id, method, status, claimant_name, claimant_role_title, evidence_note, channel_confirmed_at, decision_reason, decided_at, is_demo, created_at";
const claimRow = z.object({
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

const toClaimView = (r: z.infer<typeof claimRow>): ClaimView => ({
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

async function eventsAndEvidence(client: SupabaseClient, claimId: string) {
  const [ev, docs] = await Promise.all([
    client.from("claim_status_events").select(EVENT_COLUMNS).eq("claim_id", claimId).order("created_at").order("id"),
    client.from("claim_evidence").select(EVIDENCE_COLUMNS).eq("claim_id", claimId).order("created_at").order("id"),
  ]);
  if (ev.error || docs.error) throw new ClaimRepositoryError("database", "consulta: database");
  return { events: z.array(eventRow).parse(ev.data).map(toEvent), evidence: z.array(evidenceRow).parse(docs.data).map(toEvidence) };
}

/** A reivindicação mais relevante do ator para a escola (aberta primeiro, senão a mais recente). */
export async function getMyClaimForSchool(actor: SessionActor, inep: string, deps: Deps = {}): Promise<ClaimView | null> {
  requireActor(actor);
  if (!inepSchema.safeParse(inep).success) return null;
  const session = deps.session ?? (await createClient());
  const school = await session.from("schools").select("id").eq("inep", inep).maybeSingle();
  const schoolId = z.object({ id: z.uuid() }).safeParse(school.data);
  if (!schoolId.success) return null;
  const { data, error } = await session
    .from("claims")
    .select(CLAIM_COLUMNS)
    .eq("school_id", schoolId.data.id)
    .eq("claimant_id", actor.userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  const rows = z.array(claimRow).parse(data);
  const open = rows.find((r) => OPEN_CLAIM_STATUSES.includes(r.status));
  const pick = open ?? rows[0];
  return pick ? toClaimView(pick) : null;
}

/** Estado, linha do tempo e evidências (metadados) da própria reivindicação. Expira token vencido antes de ler. */
export async function getClaimStatusView(actor: SessionActor, claimId: string, deps: Deps = {}): Promise<ClaimStatusView | null> {
  requireActor(actor);
  if (!uuidSchema.safeParse(claimId).success) return null;
  const session = deps.session ?? (await createClient());
  const first = await session.from("claims").select("id").eq("id", claimId).eq("claimant_id", actor.userId).maybeSingle();
  if (first.error || !first.data) return null;
  const repo = deps.repo ?? adminRepo(deps, deps.admin ?? createAdminClient());
  await repo.expireTokens(actor, claimId);
  const { data, error } = await session.from("claims").select(CLAIM_COLUMNS).eq("id", claimId).eq("claimant_id", actor.userId).maybeSingle();
  if (error || !data) return null;
  return { ...toClaimView(claimRow.parse(data)), ...(await eventsAndEvidence(session, claimId)) };
}

const schoolRow = z.object({
  id: z.uuid(),
  inep: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  verification_status: verificationStatusSchema,
  is_demo: z.boolean(),
  municipalities: z.object({ name: z.string(), is_enabled: z.boolean() }),
});

const BLOCK: Partial<Record<VerificationStatus, string>> = {
  verified: "Esta escola já tem administrador. O pedido de acesso adicional ainda não está disponível.",
  suspended: "Esta escola não aceita reivindicação no momento.",
};

/**
 * Escola encontrada no cadastro do INEP + métodos disponíveis. Lê `email`/`phone` com service role só para decidir
 * a disponibilidade; NUNCA os devolve. `null` = escola inexistente ou município não habilitado (404).
 */
export async function getSchoolClaimContext(inep: string, deps: Deps & { env?: SenderEnv } = {}): Promise<SchoolClaimContext | null> {
  if (!inepSchema.safeParse(inep).success) return null;
  const admin = deps.admin ?? createAdminClient();
  const { data, error } = await admin
    .from("schools")
    .select("id, inep, name, email, phone, verification_status, is_demo, municipalities!inner(name, is_enabled)")
    .eq("inep", inep)
    .maybeSingle();
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  const parsed = schoolRow.safeParse(data);
  if (!parsed.success || !parsed.data.municipalities.is_enabled) return null;
  const s = parsed.data;
  const sender = getClaimTokenSender(deps.env ?? { DEMO_CLAIM_DELIVERY: process.env.DEMO_CLAIM_DELIVERY, APP_ENV: process.env.APP_ENV, VERCEL_ENV: process.env.VERCEL_ENV }, { isDemo: s.is_demo });
  return {
    school: { id: s.id, inep: s.inep, name: s.name, municipality: s.municipalities.name, verificationStatus: s.verification_status, isDemo: s.is_demo },
    blockedReason: BLOCK[s.verification_status] ?? null,
    methods: availableMethods({ hasEmail: Boolean(s.email), phone: s.phone, sender }),
  };
}

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
