import { describe, expect, it } from "vitest";

import { createReportSchema, resolveReportSchema } from "@/features/reports/schemas";

const LIST_ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const REPORT_ID = "4f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";

describe("createReportSchema", () => {
  it("aceita o caso comum, sem detailCode", () => {
    const r = createReportSchema.parse({ targetType: "school_list", targetId: LIST_ID, reason: "preco_incorreto" });
    expect(r.detailCode).toBeNull();
  });
  it("aceita detailCode código curto e normaliza minúsculas", () => {
    const r = createReportSchema.parse({ targetType: "school_list", targetId: LIST_ID, reason: "outro", detailCode: "ITEM_repetido" });
    expect(r.detailCode).toBe("item_repetido");
  });
  it.each([
    ["com espaço (prosa)", "nome da mae eh maria"],
    ["maiúscula acentuada", "preço errado"],
    ["começa com número", "1_item"],
    ["muito longo", "a".repeat(61)],
  ])("recusa detailCode %s", (_n, detailCode) => {
    expect(createReportSchema.safeParse({ targetType: "school_list", targetId: LIST_ID, reason: "outro", detailCode }).success).toBe(false);
  });
  it("recusa targetType e reason fora do enum", () => {
    expect(createReportSchema.safeParse({ targetType: "student", targetId: LIST_ID, reason: "outro" }).success).toBe(false);
    expect(createReportSchema.safeParse({ targetType: "school_list", targetId: LIST_ID, reason: "livre" }).success).toBe(false);
  });
  it("revisão de segurança (0604): 'stationery'/'catalog_item' ainda não têm UI/Ruling — recusados, mesmo sendo valores reais do enum do banco", () => {
    expect(createReportSchema.safeParse({ targetType: "stationery", targetId: LIST_ID, reason: "outro" }).success).toBe(false);
    expect(createReportSchema.safeParse({ targetType: "catalog_item", targetId: LIST_ID, reason: "outro" }).success).toBe(false);
  });
  it("recusa targetId que não é uuid", () => {
    expect(createReportSchema.safeParse({ targetType: "school_list", targetId: "abc", reason: "outro" }).success).toBe(false);
  });
});

describe("resolveReportSchema", () => {
  it("'reviewing' não aceita resolution", () => {
    expect(resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "reviewing" }).success).toBe(true);
    expect(resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "reviewing", resolution: "upheld" }).success).toBe(false);
  });
  it("'resolved'/'dismissed' exigem resolution", () => {
    expect(resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "resolved" }).success).toBe(false);
    expect(resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "resolved", resolution: "upheld" }).success).toBe(true);
    expect(resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "dismissed", resolution: "no_action" }).success).toBe(true);
  });
  it("resolutionNote segue a mesma regra de código (sem prosa)", () => {
    expect(
      resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "resolved", resolution: "upheld", resolutionNote: "lista arquivada por denúncia" }).success,
    ).toBe(false);
    expect(
      resolveReportSchema.safeParse({ reportId: REPORT_ID, status: "resolved", resolution: "upheld", resolutionNote: "lista_arquivada" }).success,
    ).toBe(true);
  });
});
