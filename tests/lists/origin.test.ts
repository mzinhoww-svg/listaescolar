import { describe, expect, it } from "vitest";

import {
  getListOriginByVersion,
  listOriginHref,
  listPublishedGradeYears,
  type PublicClient,
} from "@/features/lists/queries";

type Row = Record<string, unknown>;
/** Cliente falso: cada tabela devolve as linhas dadas; filtros são ignorados (as tabelas do teste têm uma linha por caso). */
function fake(tables: Record<string, Row[]>): PublicClient {
  const q = (rows: Row[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
    return b;
  };
  return { from: (t: string) => q(tables[t] ?? []) } as unknown as PublicClient;
}

describe("origem da lista e atalhos (revisão UX B1/menores)", () => {
  it("listPublishedGradeYears devolve só listas com versão atual e série conhecida", async () => {
    const client = fake({
      schools: [{ id: "s1" }],
      school_lists: [
        { grade_id: "g4", school_year: 2027, current_version_id: "v1" },
        { grade_id: "g5", school_year: 2027, current_version_id: null },
      ],
      grades: [{ id: "g4", slug: "ef-4" }, { id: "g5", slug: "ef-5" }],
    });
    expect(await listPublishedGradeYears("99001001", { client })).toEqual([{ gradeSlug: "ef-4", year: 2027 }]);
  });

  it("sem escola ou sem listas, devolve vazio", async () => {
    expect(await listPublishedGradeYears("1", { client: fake({}) })).toEqual([]);
    expect(await listPublishedGradeYears("1", { client: fake({ schools: [{ id: "s" }] }) })).toEqual([]);
  });

  it("getListOriginByVersion resolve escola, série e ano; versão desconhecida vira null", async () => {
    const client = fake({
      list_versions: [{ list_id: "l1" }],
      school_lists: [{ school_id: "s1", grade_id: "g4", school_year: 2027 }],
      schools: [{ inep: "99001001" }],
      grades: [{ slug: "ef-4" }],
    });
    const origin = await getListOriginByVersion("v1", { client });
    expect(origin).toEqual({ inep: "99001001", gradeSlug: "ef-4", year: 2027 });
    expect(listOriginHref(origin)).toBe("/escolas/99001001/ef-4?ano=2027");
    expect(await getListOriginByVersion("v1", { client: fake({}) })).toBeNull();
    expect(listOriginHref(null)).toBeNull();
  });
});
