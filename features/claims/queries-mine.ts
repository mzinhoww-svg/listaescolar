import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

import { ClaimRepositoryError } from "./repository";
import { CLAIM_STATUSES } from "./state";
import { verificationStatusSchema, type VerificationStatus } from "./types";

export type MySchoolRow = { schoolId: string; inep: string; name: string; verificationStatus: VerificationStatus; isDemo: boolean; memberRole: string };
export type MyClaimRow = { id: string; status: (typeof CLAIM_STATUSES)[number]; decisionReason: string | null; createdAt: string; isDemo: boolean; school: { inep: string; name: string } };

const memberRow = z.object({
  school_id: z.uuid(),
  member_role: z.string(),
  schools: z.object({ inep: z.string(), name: z.string(), verification_status: verificationStatusSchema, is_demo: z.boolean() }),
});
const claimRow = z.object({
  id: z.uuid(),
  status: z.enum(CLAIM_STATUSES),
  decision_reason: z.string().nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
  schools: z.object({ inep: z.string(), name: z.string() }),
});

const publishedRow = z.object({
  school_id: z.uuid(),
  school_year: z.number().int(),
  grades: z.union([z.object({ slug: z.string() }), z.array(z.object({ slug: z.string() })), z.null()]),
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

/** Ids de escola (entre os informados) com lista publicada. Cliente público (RLS); falha vira "sem lista", que só sugere enviar. */
export async function listSchoolIdsWithPublishedList(schoolIds: readonly string[]): Promise<Set<string>> {
  if (schoolIds.length === 0) return new Set();
  try {
    const { data, error } = await createPublicClient().from("school_lists").select("school_id").eq("status", "published").in("school_id", [...schoolIds]);
    if (error) return new Set();
    return new Set((data ?? []).map((r: { school_id: string }) => r.school_id));
  } catch {
    return new Set();
  }
}

export type PublishedListLink = { href: string; gradeSlug: string };

/**
 * Lista publicada mais recente de cada escola (entre as informadas): destino direto de "Ver a lista oficial" e origem do
 * cartão de divulgação. Cliente público (RLS); falha vira "sem lista" (só sugere enviar).
 */
export async function listPublishedListLinks(schools: readonly { schoolId: string; inep: string }[]): Promise<Map<string, PublishedListLink>> {
  const out = new Map<string, PublishedListLink>();
  if (schools.length === 0) return out;
  try {
    const { data, error } = await createPublicClient()
      .from("school_lists")
      .select("school_id, school_year, published_at, grades(slug)")
      .eq("status", "published")
      .in("school_id", schools.map((s) => s.schoolId))
      .order("published_at", { ascending: false });
    if (error) return out;
    const inepOf = new Map(schools.map((s) => [s.schoolId, s.inep]));
    for (const r of z.array(publishedRow).parse(data ?? [])) {
      const inep = inepOf.get(r.school_id);
      const slug = Array.isArray(r.grades) ? r.grades[0]?.slug : r.grades?.slug;
      if (!inep || !slug || out.has(r.school_id)) continue;
      out.set(r.school_id, { href: `/escolas/${inep}/${slug}?ano=${r.school_year}`, gradeSlug: slug });
    }
  } catch {
    return new Map();
  }
  return out;
}
