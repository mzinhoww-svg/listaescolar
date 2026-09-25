"use server";

import { getCurrentUser } from "@/features/auth/queries";
import { parseSearchParams } from "@/features/schools/search/params";
import { getSchoolByInep, searchSchools } from "@/features/schools/search/repository";

export type SchoolHit = { id: string; name: string; inep: string; neighborhood: string | null; municipalityName: string };
export type SchoolSearchOutcome = { status: "ok"; hits: SchoolHit[] } | { status: "error" };

const MAX_HITS = 10;

/**
 * Busca de escola para os seletores (S04 reutilizada): só dado público (RLS: municípios habilitados), só para quem está logado.
 * INEP exato vira um único resultado. Erro devolve `error` (a tela diz "tente de novo"); nunca lista inventada.
 */
export async function searchSchoolsAction(q: unknown): Promise<SchoolSearchOutcome> {
  if (typeof q !== "string" || !(await getCurrentUser())) return { status: "error" };
  try {
    const input = parseSearchParams({ q: q.slice(0, 200) });
    const result = await searchSchools(input);
    if (result.kind === "redirect") {
      const hit = await getSchoolByInep(result.inep);
      return { status: "ok", hits: hit ? [{ id: hit.id, name: hit.name, inep: hit.inep, neighborhood: hit.neighborhood, municipalityName: hit.municipalityName }] : [] };
    }
    if (result.kind !== "results") return { status: "ok", hits: [] };
    return { status: "ok", hits: result.schools.slice(0, MAX_HITS).map((s) => ({ id: s.id, name: s.name, inep: s.inep, neighborhood: s.neighborhood, municipalityName: s.municipalityName })) };
  } catch {
    return { status: "error" };
  }
}
