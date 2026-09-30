import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const rowSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  grade: z.string().nullable(),
  school_year: z.number().nullable(),
  school_id: z.uuid().nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
});

export type MySubmission = {
  id: string;
  status: string;
  grade: string | null;
  schoolYear: number | null;
  schoolName: string | null;
  createdAt: string;
  isDemo: boolean;
};

/**
 * Envios da própria pessoa (UX-060), do mais novo ao mais antigo. Cliente DO USUÁRIO (a RLS já limita ao dono ou
 * ao admin) e filtro por `submitted_by`, para o admin também ver só os seus aqui. Nome da escola vem de `schools`
 * (leitura pública dos municípios habilitados); escola fora dessa leitura fica sem nome.
 */
export async function listMySubmissions(supabase: SupabaseClient, ownerId: string, limit = 50): Promise<MySubmission[]> {
  const res = await supabase
    .from("list_submissions")
    .select("id, status, grade, school_year, school_id, created_at, is_demo")
    .eq("submitted_by", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) throw new Error("listar envios");
  const rows = z.array(rowSchema).parse(res.data ?? []);
  const schoolIds = [...new Set(rows.map((r) => r.school_id).filter((id): id is string => id !== null))];
  const names = new Map<string, string>();
  if (schoolIds.length > 0) {
    const schools = await supabase.from("schools").select("id, name").in("id", schoolIds);
    for (const s of (schools.data ?? []) as { id: string; name: string }[]) names.set(s.id, s.name);
  }
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    grade: r.grade,
    schoolYear: r.school_year,
    schoolName: r.school_id ? (names.get(r.school_id) ?? null) : null,
    createdAt: r.created_at,
    isDemo: r.is_demo,
  }));
}
