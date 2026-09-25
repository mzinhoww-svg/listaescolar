import { z } from "zod";

import { GRADE_OPTIONS } from "@/features/submissions/copy";
import { ALERT_CODE_LIST, ITEM_CATEGORIES } from "../../supabase/functions/_shared/extraction-schema";

import { ITEM_ORIGINS, REJECT_REASONS } from "./codes";

// Mesmas regras de public.review_items_valid (0204): o Zod é a fronteira de forms/Server Actions; o SQL é a última defesa.
const HOSTILE_CHARS = /[\p{Cc}​-‏‪-‮⁦-⁩﻿]/u;

export const reviewItemSchema = z
  .object({
    name: z.string().trim().min(1).max(300).refine((s) => !HOSTILE_CHARS.test(s), "caracteres de controle"),
    quantity: z.number().int().min(1).max(9999).nullable(),
    unit: z.string().max(40).refine((s) => !HOSTILE_CHARS.test(s), "caracteres de controle").nullable(),
    category: z.enum(ITEM_CATEGORIES).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    alerts: z.array(z.enum(ALERT_CODE_LIST)).max(10),
    origin: z.enum(ITEM_ORIGINS),
  })
  .strict();
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const reviewItemsSchema = z.array(reviewItemSchema).max(500);
export const versionNumber = z.number().int().min(1).max(200);

/** Edição do admin: a lista inteira + versão esperada. `actorId` NUNCA entra aqui (vem só da sessão). */
export const reviewPayloadSchema = z
  .object({
    grade: z.enum(GRADE_OPTIONS).nullable(),
    schoolYear: z.number().int().min(2000).max(2100).nullable(),
    items: reviewItemsSchema,
    expectedVersion: versionNumber,
  })
  .strict();
export type ReviewPayload = z.infer<typeof reviewPayloadSchema>;

export const parentCopyPayloadSchema = z.object({ items: reviewItemsSchema, expectedVersion: z.number().int().min(1).max(100000) }).strict();
export type ParentCopyPayload = z.infer<typeof parentCopyPayloadSchema>;

export const rejectSchema = z.object({ reason: z.enum(REJECT_REASONS), expectedVersion: versionNumber }).strict();
export const approveSchema = z.object({ expectedVersion: versionNumber, acknowledged: z.boolean() }).strict();
export const submissionIdSchema = z.uuid();
export const assignSchoolSchema = z.object({ schoolId: z.uuid(), expectedVersion: versionNumber }).strict();
