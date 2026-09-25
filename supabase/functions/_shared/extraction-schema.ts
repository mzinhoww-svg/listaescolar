// Contrato de saída do pipeline de extração. Compartilhado: features/submissions (re-exporta) e a Edge Function.
// Importa "zod" por nome: no Deno vem do deno.json da função (ocr-worker/deno.json); no Node, do node_modules.
import { z } from "zod";

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
