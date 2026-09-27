import { describe, expect, it } from "vitest";

import { CreateCampaignInputSchema, DecideCampaignInputSchema, GenerateStatementInputSchema } from "@/features/campaigns/schemas";

const VALID_CREATE = {
  partnerId: "11111111-1111-4111-8111-111111111111",
  name: "Campanha Volta às Aulas",
  productLabel: "Caderno universitário 96 folhas",
  pricingModel: "cpm" as const,
  bidReais: 10,
  totalBudgetReais: 1000,
  targetCategory: "papelaria",
};

describe("CreateCampaignInputSchema", () => {
  it("aceita o payload mínimo válido", () => {
    expect(CreateCampaignInputSchema.parse(VALID_CREATE)).toMatchObject({ name: VALID_CREATE.name });
  });

  it("recusa orçamento diário maior que o total", () => {
    expect(() => CreateCampaignInputSchema.parse({ ...VALID_CREATE, dailyBudgetReais: 2000 })).toThrow();
  });

  it("recusa campo extra (.strict())", () => {
    expect(() => CreateCampaignInputSchema.parse({ ...VALID_CREATE, precoUnitario: 10 })).toThrow();
  });

  it("recusa bid não positivo", () => {
    expect(() => CreateCampaignInputSchema.parse({ ...VALID_CREATE, bidReais: 0 })).toThrow();
  });
});

describe("DecideCampaignInputSchema", () => {
  it("exige motivo para rejeitar", () => {
    expect(() => DecideCampaignInputSchema.parse({ campaignId: VALID_CREATE.partnerId, to: "rejected" })).toThrow();
  });

  it("aprovar não exige motivo", () => {
    expect(DecideCampaignInputSchema.parse({ campaignId: VALID_CREATE.partnerId, to: "approved" })).toMatchObject({ to: "approved" });
  });
});

describe("GenerateStatementInputSchema", () => {
  it("recusa período invertido", () => {
    expect(() => GenerateStatementInputSchema.parse({ partnerId: VALID_CREATE.partnerId, periodStart: "2026-09-30", periodEnd: "2026-09-01" })).toThrow();
  });

  it("aceita período válido", () => {
    expect(GenerateStatementInputSchema.parse({ partnerId: VALID_CREATE.partnerId, periodStart: "2026-09-01", periodEnd: "2026-09-30" })).toBeTruthy();
  });
});
