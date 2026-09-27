import type { SessionActor } from "@/features/auth/actor";

import { CampaignServiceError } from "./errors";
import type { CampaignRow, CreateCampaignPayload } from "./repository";
import {
  CreateCampaignInputSchema,
  DecideCampaignInputSchema,
  OwnerTransitionInputSchema,
  ResumeCampaignInputSchema,
  SubmitCampaignInputSchema,
  type CreateCampaignInput,
  type DecideCampaignInput,
  type OwnerTransitionInput,
  type ResumeCampaignInput,
  type SubmitCampaignInput,
} from "./schemas";

// Casos de uso das campanhas B2B (S26). Autorização final é do banco (SessionActor + funções SQL 0503); aqui vão
// as regras de produto (conversão reais -> centavos, Zod na fronteira) — mesmo padrão de features/b2b/service.ts.

export type CampaignRepository = {
  createCampaign: (actor: SessionActor, partnerId: string, payload: CreateCampaignPayload) => Promise<{ campaignId: string }>;
  transitionCampaign: (actor: SessionActor, campaignId: string, to: string, reason?: string) => Promise<string>;
  listCampaignsForPartner: (partnerId: string) => Promise<CampaignRow[]>;
  listCampaignsPendingReview: () => Promise<CampaignRow[]>;
  getCampaign: (campaignId: string) => Promise<CampaignRow | null>;
};

export type CampaignServiceDeps = { repo: CampaignRepository };

function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin") throw new CampaignServiceError("só admin executa esta ação", "forbidden");
}

/** Reais (formulário) -> centavos (banco). Arredonda para o centavo mais próximo. */
function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export class CampaignService {
  constructor(private readonly deps: CampaignServiceDeps) {}

  async createCampaign(actor: SessionActor, rawInput: unknown): Promise<{ campaignId: string }> {
    const input: CreateCampaignInput = CreateCampaignInputSchema.parse(rawInput);
    const payload: CreateCampaignPayload = {
      name: input.name,
      productLabel: input.productLabel,
      creativeText: input.creativeText,
      pricingModel: input.pricingModel,
      bidCents: toCents(input.bidReais),
      dailyBudgetCents: input.dailyBudgetReais === undefined ? undefined : toCents(input.dailyBudgetReais),
      totalBudgetCents: toCents(input.totalBudgetReais),
      targetCategory: input.targetCategory,
      targetGradeStages: input.targetGradeStages,
      targetCityIbgeCodes: input.targetCityIbgeCodes,
    };
    return this.deps.repo.createCampaign(actor, input.partnerId, payload);
  }

  async submitCampaign(actor: SessionActor, rawInput: unknown): Promise<void> {
    const input: SubmitCampaignInput = SubmitCampaignInputSchema.parse(rawInput);
    await this.deps.repo.transitionCampaign(actor, input.campaignId, "pending_review");
  }

  async ownerTransition(actor: SessionActor, rawInput: unknown): Promise<void> {
    const input: OwnerTransitionInput = OwnerTransitionInputSchema.parse(rawInput);
    await this.deps.repo.transitionCampaign(actor, input.campaignId, input.to, input.reason);
  }

  async resumeCampaign(actor: SessionActor, rawInput: unknown): Promise<void> {
    const input: ResumeCampaignInput = ResumeCampaignInputSchema.parse(rawInput);
    await this.deps.repo.transitionCampaign(actor, input.campaignId, "approved");
  }

  /** Admin: aprova ou rejeita uma campanha pendente (Admin16). */
  async decideCampaign(actor: SessionActor, rawInput: unknown): Promise<void> {
    requireAdmin(actor);
    const input: DecideCampaignInput = DecideCampaignInputSchema.parse(rawInput);
    await this.deps.repo.transitionCampaign(actor, input.campaignId, input.to, input.reason);
  }

  async listMyCampaigns(partnerId: string): Promise<CampaignRow[]> {
    return this.deps.repo.listCampaignsForPartner(partnerId);
  }

  /** Admin: fila de aprovação (Admin16). */
  async listPendingReview(actor: SessionActor): Promise<CampaignRow[]> {
    requireAdmin(actor);
    return this.deps.repo.listCampaignsPendingReview();
  }

  async getCampaign(campaignId: string): Promise<CampaignRow | null> {
    return this.deps.repo.getCampaign(campaignId);
  }
}
