import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

import { isIndexableSchool } from "./seo";

type Deps = { client?: ReturnType<typeof createPublicClient> };
export type IndexableSchool = { inep: string; updatedAt: string };

const PAGE = 1000; // teto de linhas por requisição do PostgREST

/**
 * Perfis indexáveis para o sitemap. Filtra no banco (claimed|verified, não demo) e reaplica `isIndexableSchool`
 * em código: a regra da S04 é a única definição de "indexável". Colunas mínimas (sem e-mail, endereço ou CEP).
 */
export async function listIndexableSchools({ limit }: { limit: number }, deps: Deps = {}): Promise<IndexableSchool[]> {
  const client = deps.client ?? createPublicClient();
  const out: IndexableSchool[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await client
      .from("schools")
      .select("inep,updated_at,verification_status,is_demo")
      .in("verification_status", ["claimed", "verified"])
      .eq("is_demo", false)
      .order("inep")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("sitemap_schools_failed", { cause: error });
    const rows = data ?? [];
    for (const r of rows) {
      const indexable = isIndexableSchool({
        verificationStatus: r.verification_status as "registered" | "claimed" | "verified" | "suspended",
        isDemo: r.is_demo,
      });
      if (indexable && /^\d{8}$/.test(r.inep)) out.push({ inep: r.inep, updatedAt: r.updated_at });
    }
    if (rows.length < PAGE) break;
  }
  return out.slice(0, limit);
}
