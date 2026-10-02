import "server-only";

import { academicYears, findGrade } from "@/features/grades/catalog";
import { createPublicClient } from "@/lib/supabase/public";

export type PublishedListShortcut = {
  inep: string;
  schoolName: string;
  gradeSlug: string;
  gradeLabel: string;
  year: number;
  isDemo: boolean;
  href: string;
};

export type PublishedListsClient = ReturnType<typeof createPublicClient>;

type Row = {
  school_year: number;
  is_demo: boolean;
  schools: { inep: string; name: string; is_demo: boolean } | { inep: string; name: string; is_demo: boolean }[] | null;
  grades: { slug: string } | { slug: string }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Atalhos da busca: escolas de município habilitado com lista publicada (até `limit`, uma por escola).
 * Só leitura, com o cliente publicável (RLS). Sem nenhuma, devolve [] e a seção não aparece; erro também devolve [].
 */
export async function listPublishedListShortcuts(
  deps: { client?: PublishedListsClient; limit?: number } = {},
): Promise<PublishedListShortcut[]> {
  const limit = deps.limit ?? 6;
  try {
    const client = deps.client ?? createPublicClient();
    const muni = await client.from("municipalities").select("id").eq("is_enabled", true);
    if (muni.error) throw new Error(muni.error.code);
    const ids = (muni.data ?? []).map((m: { id: string }) => m.id);
    if (ids.length === 0) return [];
    const { data, error } = await client
      .from("school_lists")
      .select("school_year,is_demo,schools!inner(inep,name,is_demo,municipality_id),grades!inner(slug)")
      .eq("status", "published")
      .in("schools.municipality_id", ids)
      .order("published_at", { ascending: false })
      .limit(limit * 4);
    if (error) throw new Error(error.code);
    const years = academicYears(new Date());
    const seen = new Set<string>();
    const out: PublishedListShortcut[] = [];
    for (const r of (data ?? []) as unknown as Row[]) {
      const school = one(r.schools);
      const grade = one(r.grades);
      if (!school || !grade || seen.has(school.inep)) continue;
      const g = findGrade(grade.slug);
      if (!g || !years.includes(r.school_year)) continue; // a página da lista só abre os anos suportados
      seen.add(school.inep);
      out.push({
        inep: school.inep,
        schoolName: school.name,
        gradeSlug: g.slug,
        gradeLabel: g.label,
        year: r.school_year,
        isDemo: school.is_demo || r.is_demo,
        href: `/escolas/${school.inep}/${g.slug}?ano=${r.school_year}`,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error("escolas: falha ao ler listas publicadas", e instanceof Error ? e.message : "erro");
    return [];
  }
}
