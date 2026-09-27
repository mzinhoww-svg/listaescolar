import { describe, expect, it } from "vitest";

import { auditFilterSchema } from "@/features/admin/audit";

describe("auditFilterSchema", () => {
  it("aceita vazio e cada filtro isolado", () => {
    expect(auditFilterSchema.safeParse({}).success).toBe(true);
    expect(auditFilterSchema.safeParse({ action: "UPDATE" }).success).toBe(true);
    expect(auditFilterSchema.safeParse({ entityTable: "reports" }).success).toBe(true);
    expect(auditFilterSchema.safeParse({ since: "2026-09-01", until: "2026-09-30" }).success).toBe(true);
  });
  it.each([
    ["entityId não-uuid", { entityId: "abc" }],
    ["actorId não-uuid", { actorId: "abc" }],
    ["since fora do formato", { since: "01/09/2026" }],
    ["until fora do formato", { until: "2026-9-1" }],
  ])("recusa %s", (_n, patch) => {
    expect(auditFilterSchema.safeParse(patch).success).toBe(false);
  });
});
