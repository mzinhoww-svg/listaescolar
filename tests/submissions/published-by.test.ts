import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls: Array<[string, ...unknown[]]> = [];
let row: { kind: string } | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = (...a: unknown[]) => (calls.push([m, ...a]), b);
    b.maybeSingle = async () => ({ data: row });
    return b;
  },
}));
vi.mock("@/features/submissions/pipeline-factory", () => ({ getExtractionPipeline: () => ({}) }));

import { publishedByOf } from "@/features/submissions/status";

describe("publishedByOf", () => {
  it("filtra decision e kind e prefere a decisão mais recente (created_at desc)", async () => {
    row = { kind: "review" };
    calls.length = 0;
    expect(await publishedByOf("s1")).toBe("human");
    expect(calls).toContainEqual(["eq", "decision", "published"]);
    expect(calls).toContainEqual(["in", "kind", ["publication", "review"]]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
    row = { kind: "publication" };
    expect(await publishedByOf("s1")).toBe("auto");
    row = null;
    expect(await publishedByOf("s1")).toBeNull();
  });
});
