import { z } from "zod";

import { REPORT_REASONS, REPORT_RESOLUTIONS } from "./ports";

/** Código curto, nunca prosa (mesma regra do banco, ai_decisions.justification): bloqueia dado pessoal por construção. */
const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_:.-]{0,59}$/, "Use só um código curto, sem espaço nem acento (ex.: item_repetido).")
  .nullish()
  .transform((v) => v ?? null);

// Revisão de segurança (0604): o banco só aceita target_type = 'school_list' por enquanto (CHECK + gatilho);
// papelaria e item de catálogo ficam reservados para quando existir UI e Ruling para eles (D-150). Espelhado
// aqui: o Zod público nunca deveria nem tentar os outros dois, mesmo que o banco já recuse.
export const createReportSchema = z.object({
  targetType: z.literal("school_list"),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  detailCode: codeSchema,
});
export type CreateReportForm = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z
  .object({
    reportId: z.uuid(),
    status: z.enum(["reviewing", "resolved", "dismissed"] as const),
    resolution: z.enum(REPORT_RESOLUTIONS).nullish().transform((v) => v ?? null),
    resolutionNote: codeSchema,
  })
  // mesma regra do CHECK de banco (reports_resolution_consistency): resolução só junto de resolved/dismissed.
  .refine((v) => (v.status === "reviewing" ? v.resolution === null : v.resolution !== null), {
    message: "Informe se a denúncia procede ou não para resolver/arquivar.",
    path: ["resolution"],
  });
export type ResolveReportForm = z.infer<typeof resolveReportSchema>;
