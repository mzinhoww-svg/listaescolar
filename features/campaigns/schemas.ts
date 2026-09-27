import { z } from "zod";

// Zod em toda fronteira do domínio de campanhas (formulário da Nova Campanha, decisão do admin, extrato).
// `.strict()` sempre: campo extra é erro de programação do cliente, nunca silenciosamente ignorado.

export const GRADE_STAGES = ["ei", "ef", "em"] as const;
export const PRICING_MODELS = ["cpm", "cpc"] as const;
export const CAMPAIGN_STATUSES = ["draft", "pending_review", "approved", "rejected", "paused", "completed"] as const;

// Reais (não centavos) na fronteira do formulário; o serviço converte para centavos antes de chamar o banco.
export const CreateCampaignInputSchema = z
  .object({
    partnerId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    productLabel: z.string().trim().min(1).max(200),
    creativeText: z.string().trim().min(1).max(280).optional(),
    pricingModel: z.enum(PRICING_MODELS),
    bidReais: z.number().positive().max(1_000_000),
    dailyBudgetReais: z.number().positive().max(1_000_000).optional(),
    totalBudgetReais: z.number().positive().max(1_000_000),
    targetCategory: z.string().trim().min(1).max(100),
    targetGradeStages: z.array(z.enum(GRADE_STAGES)).min(1).max(3).optional(),
    targetCityIbgeCodes: z.array(z.string().regex(/^\d{7}$/)).min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => v.dailyBudgetReais === undefined || v.dailyBudgetReais <= v.totalBudgetReais, {
    message: "orçamento diário não pode passar do total",
    path: ["dailyBudgetReais"],
  });
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const SubmitCampaignInputSchema = z.object({ campaignId: z.uuid() }).strict();
export type SubmitCampaignInput = z.infer<typeof SubmitCampaignInputSchema>;

export const OwnerTransitionInputSchema = z
  .object({ campaignId: z.uuid(), to: z.enum(["paused", "completed"] as const), reason: z.string().trim().min(1).max(500).optional() })
  .strict();
export type OwnerTransitionInput = z.infer<typeof OwnerTransitionInputSchema>;

export const ResumeCampaignInputSchema = z.object({ campaignId: z.uuid() }).strict();
export type ResumeCampaignInput = z.infer<typeof ResumeCampaignInputSchema>;

export const DecideCampaignInputSchema = z
  .object({ campaignId: z.uuid(), to: z.enum(["approved", "rejected"] as const), reason: z.string().trim().min(1).max(500).optional() })
  .strict()
  .refine((v) => v.to !== "rejected" || (v.reason !== undefined && v.reason.length > 0), {
    message: "motivo obrigatório para rejeitar",
    path: ["reason"],
  });
export type DecideCampaignInput = z.infer<typeof DecideCampaignInputSchema>;

export const RecordCampaignEventInputSchema = z
  .object({
    campaignId: z.uuid(),
    listVersionId: z.uuid().nullable(),
    eventType: z.enum(["impression", "click"] as const),
    dedupeKey: z.string().regex(/^[0-9a-f]{16,128}$/),
  })
  .strict();
export type RecordCampaignEventInput = z.infer<typeof RecordCampaignEventInputSchema>;

export const InsightsQueryInputSchema = z
  .object({ category: z.string().trim().min(1).max(100), gradeStage: z.enum(GRADE_STAGES) })
  .strict();
export type InsightsQueryInput = z.infer<typeof InsightsQueryInputSchema>;

export const SetMinKInputSchema = z.object({ minK: z.number().int().min(2).max(1000) }).strict();
export type SetMinKInput = z.infer<typeof SetMinKInputSchema>;

export const GenerateStatementInputSchema = z
  .object({
    partnerId: z.uuid(),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    paymentInstruction: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, { message: "período inválido", path: ["periodEnd"] });
export type GenerateStatementInput = z.infer<typeof GenerateStatementInputSchema>;
