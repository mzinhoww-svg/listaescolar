import { z } from "zod";

import { PAYOUT_TARGETS, PIX_KEY_KINDS } from "./ports";

export const publishSettingsInputSchema = z
  .object({
    commissionBps: z.number().int().min(0).max(10000),
    graceDays: z.number().int().min(0).max(365),
    blockDays: z.number().int().min(1).max(365),
  })
  .strict()
  .refine((v) => v.blockDays > v.graceDays, { message: "block_days deve ser maior que grace_days", path: ["blockDays"] });

export const publishSchoolConfigInputSchema = z
  .object({
    schoolId: z.uuid(),
    target: z.enum(PAYOUT_TARGETS),
    payoutBps: z.number().int().min(0).max(10000),
    beneficiaryName: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((v) => (v === "" ? null : v)),
    pixKey: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((v) => (v === "" ? null : v)),
    pixKeyKind: z.enum(PIX_KEY_KINDS).nullable(),
  })
  .strict();

export const confirmSaleInputSchema = z
  .object({
    leadId: z.uuid(),
    schoolId: z.uuid().nullable(),
  })
  .strict();

export const batchCreateInputSchema = z
  .object({
    schoolId: z.uuid(),
    beneficiaryType: z.enum(["school", "apm"]),
  })
  .strict();

export const batchMarkExecutedInputSchema = z
  .object({
    batchId: z.uuid(),
  })
  .strict();

export type PublishSettingsInput = z.infer<typeof publishSettingsInputSchema>;
export type PublishSchoolConfigInput = z.infer<typeof publishSchoolConfigInputSchema>;
export type ConfirmSaleInput = z.infer<typeof confirmSaleInputSchema>;
export type BatchCreateInput = z.infer<typeof batchCreateInputSchema>;
export type BatchMarkExecutedInput = z.infer<typeof batchMarkExecutedInputSchema>;
