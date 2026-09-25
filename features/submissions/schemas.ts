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

// Fonte única em supabase/functions/_shared (a Edge Function valida a saída do pipeline com o mesmo schema).
export { extractionResultSchema, type ExtractionResult } from "../../supabase/functions/_shared/extraction-schema";

export const notifyChannelSchema = z.enum(["none", "browser", "email", "whatsapp"]);
