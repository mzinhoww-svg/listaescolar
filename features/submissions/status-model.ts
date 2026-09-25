import { z } from "zod";

import { extractionResultSchema, type ExtractionResult } from "./schemas";

/** Corpo de `GET /api/submissions/[id]/status` (também o estado inicial da página). */
export const statusPayloadSchema = z.object({
  status: z.string(),
  jobStatus: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  notifyChannel: z.string().nullable(),
  isDemo: z.boolean(),
  pipelineAvailable: z.boolean(),
  /** Publicação feita pela porta em memória (só local): a tela mostra o selo "Demonstração". */
  publicationDemo: z.boolean().optional(),
  result: extractionResultSchema.optional(),
});
export type StatusPayload = z.infer<typeof statusPayloadSchema>;

export type Phase = "reading" | "ready" | "unavailable" | "failed";

const READY = new Set(["review_needed", "human_review", "approved", "published"]);
const FAILED = new Set(["rejected", "archived"]);

/** Fase de tela. Só `reading` continua consultando: as demais são estados finais. */
export function phaseOf(p: Pick<StatusPayload, "status" | "jobStatus" | "pipelineAvailable">): Phase {
  if (READY.has(p.status)) return "ready";
  if (FAILED.has(p.status) || p.jobStatus === "dead") return "failed";
  if (!p.pipelineAvailable) return "unavailable"; // ninguém vai processar: não adianta esperar
  return "reading";
}

export const isFinalPhase = (phase: Phase) => phase !== "reading";

/** Intervalo crescente entre consultas: 1,5 s, 2,4 s, 3,8 s... com teto de 15 s. */
export function pollDelayMs(attempt: number): number {
  return Math.min(15_000, Math.round(1_500 * 1.6 ** Math.max(0, attempt)));
}

export type { ExtractionResult };
