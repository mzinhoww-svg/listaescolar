import { describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/features/auth/actor";
import type { CampaignRow } from "@/features/campaigns/repository";
import { CampaignService, type CampaignRepository } from "@/features/campaigns/service";

function actorOf(role: SessionActor["role"] = "parent", userId = "11111111-1111-4111-8111-111111111111"): SessionActor {
  return { userId, role } as unknown as SessionActor;
}

function makeRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    createCampaign: vi.fn(async () => ({ campaignId: "22222222-2222-4222-8222-222222222222" })),
    transitionCampaign: vi.fn(async () => "approved"),
    listCampaignsForPartner: vi.fn(async () => [] as CampaignRow[]),
    listCampaignsPendingReview: vi.fn(async () => [] as CampaignRow[]),
    getCampaign: vi.fn(async () => null as CampaignRow | null),
    ...overrides,
  };
}

const VALID_INPUT = {
  partnerId: "11111111-1111-4111-8111-111111111111",
  name: "Campanha Volta às Aulas",
  productLabel: "Caderno universitário 96 folhas",
  pricingModel: "cpm" as const,
  bidReais: 10.5,
  totalBudgetReais: 1000,
  targetCategory: "papelaria",
};

describe("CampaignService.createCampaign", () => {
  it("converte reais para centavos antes de chamar o repositório", async () => {
    const repo = makeRepo();
    const svc = new CampaignService({ repo });
    await svc.createCampaign(actorOf(), VALID_INPUT);
    expect(repo.createCampaign).toHaveBeenCalledWith(expect.anything(), VALID_INPUT.partnerId, expect.objectContaining({ bidCents: 1050, totalBudgetCents: 100000 }));
  });

  it("payload inválido nunca chega ao repositório", async () => {
    const repo = makeRepo();
    const svc = new CampaignService({ repo });
    await expect(svc.createCampaign(actorOf(), { ...VALID_INPUT, bidReais: -1 })).rejects.toThrow();
    expect(repo.createCampaign).not.toHaveBeenCalled();
  });
});

describe("CampaignService.decideCampaign", () => {
  it("só admin decide", async () => {
    const repo = makeRepo();
    const svc = new CampaignService({ repo });
    await expect(svc.decideCampaign(actorOf("parent"), { campaignId: "22222222-2222-4222-8222-222222222222", to: "approved" })).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.transitionCampaign).not.toHaveBeenCalled();
  });

  it("admin aprova: chama transitionCampaign com 'approved'", async () => {
    const repo = makeRepo();
    const svc = new CampaignService({ repo });
    await svc.decideCampaign(actorOf("admin"), { campaignId: "22222222-2222-4222-8222-222222222222", to: "approved" });
    expect(repo.transitionCampaign).toHaveBeenCalledWith(expect.anything(), "22222222-2222-4222-8222-222222222222", "approved", undefined);
  });

  it("admin rejeita sem motivo é recusado antes de chamar o repositório", async () => {
    const repo = makeRepo();
    const svc = new CampaignService({ repo });
    await expect(svc.decideCampaign(actorOf("admin"), { campaignId: "22222222-2222-4222-8222-222222222222", to: "rejected" })).rejects.toThrow();
    expect(repo.transitionCampaign).not.toHaveBeenCalled();
  });
});

describe("CampaignService.listPendingReview", () => {
  it("só admin lista a fila de aprovação (Admin16)", async () => {
    const repo = makeRepo();
    const svc = new CampaignService({ repo });
    await expect(svc.listPendingReview(actorOf("parent"))).rejects.toMatchObject({ code: "forbidden" });
    await svc.listPendingReview(actorOf("admin"));
    expect(repo.listCampaignsPendingReview).toHaveBeenCalledTimes(1);
  });
});
