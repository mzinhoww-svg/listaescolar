import { z } from "zod";

export const submitMetaSchema = z.object({
  profileId: z.uuid(),
  source: z.enum(["parent", "school"]),
  schoolId: z.uuid().optional(),
  grade: z.string().trim().min(1).max(60),
  schoolYear: z.number().int().min(2000).max(2100),
  /** Consentimento explícito; qualquer coisa diferente de `true` bloqueia o envio. */
  consent: z.literal(true),
});
export type SubmitMeta = z.infer<typeof submitMetaSchema>;

export const extractionResultSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1).max(300),
      quantity: z.number().nonnegative().nullable(),
      unit: z.string().max(40).nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  overallConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(300)),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const notifyChannelSchema = z.enum(["none", "browser", "email", "whatsapp"]);
