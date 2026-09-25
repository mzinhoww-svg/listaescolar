import { describe, expect, it } from "vitest";

import { listIndexableSchools } from "@/features/schools/search/sitemap";

type Row = { inep: string; updated_at: string; verification_status: string; is_demo: boolean };
const ROWS: Row[] = [
  { inep: "51000001", updated_at: "2026-01-01T00:00:00Z", verification_status: "registered", is_demo: false },
  { inep: "51000002", updated_at: "2026-01-02T00:00:00Z", verification_status: "claimed", is_demo: false },
  { inep: "51000003", updated_at: "2026-01-03T00:00:00Z", verification_status: "verified", is_demo: false },
  { inep: "51000004", updated_at: "2026-01-04T00:00:00Z", verification_status: "suspended", is_demo: false },
  { inep: "51000005", updated_at: "2026-01-05T00:00:00Z", verification_status: "verified", is_demo: true },
];

/** Cliente falso que ignora filtros do servidor (pior caso): a regra tem de valer também em código. */
function fakeClient(rows: Row[], error: unknown = null) {
  const calls: string[] = [];
  const builder = {
    select: (c: string) => (calls.push(`select:${c}`), builder),
    in: (col: string, vals: string[]) => (calls.push(`in:${col}:${vals.join("|")}`), builder),
    eq: (col: string, v: unknown) => (calls.push(`eq:${col}:${String(v)}`), builder),
    order: () => builder,
    range: (a: number, b: number) => Promise.resolve({ data: error ? null : rows.slice(a, b + 1), error }),
  };
  return { client: { from: (t: string) => (calls.push(`from:${t}`), builder) } as never, calls };
}

describe("listIndexableSchools", () => {
  it("devolve só claimed/verified não demo, com updatedAt", async () => {
    const { client, calls } = fakeClient(ROWS);
    const out = await listIndexableSchools({ limit: 100 }, { client });
    expect(out).toEqual([
      { inep: "51000002", updatedAt: "2026-01-02T00:00:00Z" },
      { inep: "51000003", updatedAt: "2026-01-03T00:00:00Z" },
    ]);
    expect(calls[0]).toBe("from:schools");
    expect(calls.join()).not.toMatch(/email|cep/);
    expect(calls).toContain("in:verification_status:claimed|verified");
    expect(calls).toContain("eq:is_demo:false");
  });

  it("pagina de verdade: mais de 1000 linhas exigem várias requisições", async () => {
    const many: Row[] = Array.from({ length: 2500 }, (_, i) => ({
      inep: String(51000000 + i),
      updated_at: "2026-01-01T00:00:00Z",
      verification_status: "verified",
      is_demo: false,
    }));
    const { client } = fakeClient(many);
    const out = await listIndexableSchools({ limit: 5000 }, { client });
    expect(out).toHaveLength(2500);
    expect(out[2499]?.inep).toBe("51002499");
  });

  it("linha fora do contrato (status desconhecido, inep ruim) é ignorada", async () => {
    const bad = [
      { inep: "123", updated_at: "x", verification_status: "verified", is_demo: false },
      { inep: "51000009", updated_at: "x", verification_status: "weird", is_demo: false },
      ROWS[2],
    ] as Row[];
    const { client } = fakeClient(bad);
    expect(await listIndexableSchools({ limit: 10 }, { client })).toEqual([{ inep: "51000003", updatedAt: "2026-01-03T00:00:00Z" }]);
  });

  it("erro do banco vira exceção", async () => {
    const { client } = fakeClient([], { name: "PostgrestError" });
    await expect(listIndexableSchools({ limit: 10 }, { client })).rejects.toThrow("sitemap_schools_failed");
  });

  it("respeita o limite", async () => {
    const { client } = fakeClient(ROWS);
    expect(await listIndexableSchools({ limit: 1 }, { client })).toHaveLength(1);
  });
});

