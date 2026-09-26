import { z } from "zod";

import { DISPUTE_DECISIONS, DISPUTE_REASONS, PURCHASE_ANSWERS, REVIEW_TAGS } from "./ports";

export const confirmPurchaseInputSchema = z
  .object({
    leadId: z.uuid(),
    answer: z.enum(PURCHASE_ANSWERS),
  })
  .strict();

export const reviewInputSchema = z
  .object({
    leadId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    tags: z.array(z.enum(REVIEW_TAGS)).max(REVIEW_TAGS.length),
    comment: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((v) => (v === "" ? null : v)),
  })
  .strict();

export const disputeOpenInputSchema = z
  .object({
    leadId: z.uuid(),
    reason: z.enum(DISPUTE_REASONS),
    detail: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((v) => (v === "" ? null : v)),
  })
  .strict();

export const disputeResolveInputSchema = z
  .object({
    disputeId: z.uuid(),
    decision: z.enum(DISPUTE_DECISIONS),
    reason: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((v) => (v === "" ? null : v)),
  })
  .strict();

export type ConfirmPurchaseInput = z.infer<typeof confirmPurchaseInputSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type DisputeOpenInput = z.infer<typeof disputeOpenInputSchema>;
export type DisputeResolveInput = z.infer<typeof disputeResolveInputSchema>;
