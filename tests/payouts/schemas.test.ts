import { describe, expect, it } from "vitest";

import { batchCreateInputSchema, batchMarkExecutedInputSchema, confirmSaleInputSchema, publishSchoolConfigInputSchema, publishSettingsInputSchema } from "@/features/payouts/schemas";

describe("publishSettingsInputSchema", () => {
  it("aceita bps e prazos dentro do intervalo, com blockDays > graceDays", () => {
    const r = publishSettingsInputSchema.safeParse({ commissionBps: 1000, graceDays: 5, blockDays: 15 });
    expect(r.success).toBe(true);
  });

  it("recusa blockDays <= graceDays", () => {
    const r = publishSettingsInputSchema.safeParse({ commissionBps: 1000, graceDays: 10, blockDays: 10 });
    expect(r.success).toBe(false);
  });

  it("recusa bps fora de 0..10000 e campos extras", () => {
    expect(publishSettingsInputSchema.safeParse({ commissionBps: 10001, graceDays: 5, blockDays: 15 }).success).toBe(false);
    expect(publishSettingsInputSchema.safeParse({ commissionBps: 1000, graceDays: 5, blockDays: 15, extra: 1 }).success).toBe(false);
  });
});

describe("publishSchoolConfigInputSchema", () => {
  const base = { schoolId: "11111111-1111-4111-8111-111111111111", target: "apm" as const, payoutBps: 300, beneficiaryName: "APM", pixKey: "chave@x.com", pixKeyKind: "email" as const };

  it("aceita config completa para alvo != none", () => {
    expect(publishSchoolConfigInputSchema.safeParse(base).success).toBe(true);
  });

  it("aceita alvo none mesmo sem beneficiário/chave (a regra de completude fica na função SQL)", () => {
    expect(publishSchoolConfigInputSchema.safeParse({ ...base, target: "none", beneficiaryName: null, pixKey: null, pixKeyKind: null }).success).toBe(true);
  });

  it("string vazia em beneficiaryName/pixKey vira null", () => {
    const r = publishSchoolConfigInputSchema.safeParse({ ...base, beneficiaryName: "", pixKey: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.beneficiaryName).toBeNull();
      expect(r.data.pixKey).toBeNull();
    }
  });

  it("recusa schoolId que não é uuid", () => {
    expect(publishSchoolConfigInputSchema.safeParse({ ...base, schoolId: "não-é-uuid" }).success).toBe(false);
  });
});

describe("confirmSaleInputSchema", () => {
  it("aceita schoolId nulo (venda sem escola resolvida)", () => {
    expect(confirmSaleInputSchema.safeParse({ leadId: "11111111-1111-4111-8111-111111111111", schoolId: null }).success).toBe(true);
  });

  it("recusa leadId ausente ou inválido", () => {
    expect(confirmSaleInputSchema.safeParse({ schoolId: null }).success).toBe(false);
    expect(confirmSaleInputSchema.safeParse({ leadId: "x", schoolId: null }).success).toBe(false);
  });
});

describe("batchCreateInputSchema / batchMarkExecutedInputSchema", () => {
  it("aceita beneficiaryType school/apm; recusa outro valor", () => {
    expect(batchCreateInputSchema.safeParse({ schoolId: "11111111-1111-4111-8111-111111111111", beneficiaryType: "school" }).success).toBe(true);
    expect(batchCreateInputSchema.safeParse({ schoolId: "11111111-1111-4111-8111-111111111111", beneficiaryType: "stationery" }).success).toBe(false);
  });

  it("batchMarkExecuted exige batchId uuid", () => {
    expect(batchMarkExecutedInputSchema.safeParse({ batchId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(batchMarkExecutedInputSchema.safeParse({ batchId: "x" }).success).toBe(false);
  });
});
