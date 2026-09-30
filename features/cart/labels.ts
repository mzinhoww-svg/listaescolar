import "server-only";

import { z } from "zod";

import { createPublicClient } from "@/lib/supabase/public";

import type { CartLabel } from "./title";

const rowSchema = z.object({
  id: z.uuid(),
  school_lists: z
    .object({
      schools: z.object({ name: z.string() }).nullable(),
      grades: z.object({ name: z.string() }).nullable(),
    })
    .nullable(),
});

/**
 * Escola e série de cada lista de origem dos carrinhos (UX-048). Só versões públicas resolvem; cópia privada,
 * demonstração ou erro ficam de fora e o carrinho é nomeado pela data. Nunca lança: a conta abre sem os nomes.
 */
export async function loadCartLabels(listIds: readonly string[]): Promise<Record<string, CartLabel>> {
  const ids = [...new Set(listIds)].filter((i) => z.uuid().safeParse(i).success);
  if (ids.length === 0) return {};
  try {
    const { data, error } = await createPublicClient()
      .from("list_versions")
      .select("id, school_lists(schools(name), grades(name))")
      .in("id", ids)
      .in("status", ["published", "superseded"]);
    if (error) return {};
    const out: Record<string, CartLabel> = {};
    for (const raw of data ?? []) {
      const r = rowSchema.safeParse(raw);
      const l = r.success ? r.data.school_lists : null;
      if (r.success && l?.schools && l.grades) out[r.data.id] = { schoolName: l.schools.name, gradeLabel: l.grades.name };
    }
    return out;
  } catch {
    return {};
  }
}
