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
    in: () => builder,
    eq: () => builder,
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
  });

  it("respeita o limite", async () => {
    const { client } = fakeClient(ROWS);
    expect(await listIndexableSchools({ limit: 1 }, { client })).toHaveLength(1);
  });
});

