// Params de notificação: lista FECHADA (mesma do validador SQL `notification_params_valid`). Nada de nome, e-mail, telefone, CPF,
// motivo em texto livre ou dado de estudante: só escola pública, rótulo da série, ano, código do lead e código de status.
import { z } from "zod";

export const STATUS_CODES = [
  "draft", "submitted", "processing", "processing_async", "review_needed", "human_review", "approved", "published", "archived", "rejected",
  "awaiting_verification", "token_expired", "insufficient_evidence",
  "received", "viewed", "in_progress", "quote_sent", "awaiting_customer", "converted", "declined", "expired", "cancelled",
] as const;

export const notificationParamsSchema = z
  .object({
    school_name: z.string().min(1).max(120).optional(),
    grade_label: z.string().min(1).max(60).optional(),
    school_year: z.number().int().min(2000).max(2100).optional(),
    lead_code: z.string().regex(/^LC-[0-9A-HJKMNP-TV-Z]{4,6}$/).optional(),
    status_code: z.enum(STATUS_CODES).optional(),
  })
  .strict();
export type NotificationParams = z.infer<typeof notificationParamsSchema>;

/** Caminho relativo do próprio site (mesmo formato do CHECK do banco): nunca URL externa, nunca "//". */
export function isSafeLinkPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 300 && /^\/[A-Za-z0-9/_?=&.%-]*$/.test(path) && !path.includes("//");
}
