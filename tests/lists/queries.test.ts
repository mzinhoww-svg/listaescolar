import { describe, expect, it } from "vitest";

import { toPublicList, toPublicVersionSummary } from "@/features/lists/queries";

const ID = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const I = "33333333-3333-4333-8333-333333333333";

describe("mapeamento público", () => {
  it("descarta alerts, confidence, source e ids internos, mesmo que venham na linha", () => {
    const list = toPublicList(
      { id: ID, school_year: 2027, published_at: "2026-09-25T10:00:00Z", is_demo: true, alerts: ["x"], created_by: ID },
      { id: V, version_number: 3, status: "published", published_at: "2026-09-25T10:00:00Z", item_count: 1, source: "admin", submission_id: ID },
      [
        {
          id: I, position: 1, original_name: "Caderno", normalized_name: "caderno", category: null, quantity: "2.00", unit: "un",
          confidence: 0.4, alerts: ["handwritten"],
        },
      ],
      "ef-1",
    );
    const json = JSON.stringify(list);
    expect(json).not.toMatch(/alerts|confidence|source|submission|created_by/);
    expect(list.version.items[0]).toEqual({ id: I, position: 1, name: "Caderno", normalizedName: "caderno", category: null, quantity: 2, unit: "un" });
    expect(list.gradeSlug).toBe("ef-1");
    expect(list.version.versionNumber).toBe(3);
  });

  it("resumo de histórico só aceita published/superseded", () => {
    const row = { id: V, version_number: 1, status: "superseded", published_at: "2026-09-25T10:00:00Z", item_count: 4 };
    expect(toPublicVersionSummary(row)).toEqual({
      id: V, versionNumber: 1, status: "superseded", publishedAt: "2026-09-25T10:00:00Z", itemCount: 4,
    });
    expect(() => toPublicVersionSummary({ ...row, status: "candidate" })).toThrow();
    expect(() => toPublicVersionSummary({ ...row, status: "archived" })).toThrow();
  });
});
