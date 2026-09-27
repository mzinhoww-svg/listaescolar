import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

/** Resumo mínimo de uma `school_list` para as telas de denúncia/arquivamento (S16). Nunca lê `students`. */
export type AdminListSummary = {
  id: string;
  status: string;
  schoolId: string;
  schoolName: string;
  schoolInep: string;
  gradeName: string;
  schoolYear: number;
  isDemo: boolean;
};

const rowSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  school_year: z.number(),
  is_demo: z.boolean(),
  schools: z.object({ id: z.uuid(), name: z.string(), inep: z.string() }),
  grades: z.object({ name: z.string() }),
});

export async function getListSummaryForAdmin(actor: SessionActor, listId: string): Promise<AdminListSummary | null> {
  if (actor.role !== "admin" && actor.role !== "system") throw new Error("forbidden");
  const client = await createClient();
  const { data, error } = await client
    .from("school_lists")
    .select("id, status, school_year, is_demo, schools(id, name, inep), grades(name)")
    .eq("id", listId)
    .maybeSingle();
  if (error) throw new Error(`lista indisponível: ${error.message}`);
  if (!data) return null;
  const r = rowSchema.parse(data);
  return {
    id: r.id,
    status: r.status,
    schoolId: r.schools.id,
    schoolName: r.schools.name,
    schoolInep: r.schools.inep,
    gradeName: r.grades.name,
    schoolYear: r.school_year,
    isDemo: r.is_demo,
  };
}
