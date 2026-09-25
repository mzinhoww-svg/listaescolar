import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

import { ClaimRepositoryError } from "./repository";
import { CLAIM_STATUSES } from "./state";

export type MySchoolRow = { schoolId: string; inep: string; name: string; verificationStatus: string; isDemo: boolean; memberRole: string };
export type MyClaimRow = { id: string; status: (typeof CLAIM_STATUSES)[number]; decisionReason: string | null; createdAt: string; isDemo: boolean; school: { inep: string; name: string } };

const memberRow = z.object({
  school_id: z.uuid(),
  member_role: z.string(),
  schools: z.object({ inep: z.string(), name: z.string(), verification_status: z.string(), is_demo: z.boolean() }),
});
const claimRow = z.object({
  id: z.uuid(),
  status: z.enum(CLAIM_STATUSES),
  decision_reason: z.string().nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
  schools: z.object({ inep: z.string(), name: z.string() }),
});

function requireActor(actor: unknown): asserts actor is SessionActor {
  if (!isSessionActor(actor)) throw new ClaimRepositoryError("forbidden", "consulta: forbidden");
}

/** Escolas que o usuário administra (`school_members`, RLS + filtro explícito). Só colunas públicas da escola. */
export async function listMySchools(actor: SessionActor, session?: SupabaseClient): Promise<MySchoolRow[]> {
  requireActor(actor);
  const client = session ?? (await createClient());
  const { data, error } = await client
    .from("school_members")
    .select("school_id, member_role, schools!inner(inep, name, verification_status, is_demo)")
    .eq("profile_id", actor.userId)
    .order("created_at");
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  return z.array(memberRow).parse(data).map((r) => ({
    schoolId: r.school_id,
    inep: r.schools.inep,
    name: r.schools.name,
    verificationStatus: r.schools.verification_status,
    isDemo: r.schools.is_demo,
    memberRole: r.member_role,
  }));
}

/** Reivindicações do usuário que ainda não viraram vínculo: abertas e recusadas (as aprovadas aparecem em `listMySchools`). */
export async function listMyPendingClaims(actor: SessionActor, session?: SupabaseClient): Promise<MyClaimRow[]> {
  requireActor(actor);
  const client = session ?? (await createClient());
  const { data, error } = await client
    .from("claims")
    .select("id, status, decision_reason, created_at, is_demo, schools!inner(inep, name)")
    .eq("claimant_id", actor.userId)
    .neq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new ClaimRepositoryError("database", "consulta: database");
  return z.array(claimRow).parse(data).map((r) => ({
    id: r.id,
    status: r.status,
    decisionReason: r.decision_reason,
    createdAt: r.created_at,
    isDemo: r.is_demo,
    school: r.schools,
  }));
}
