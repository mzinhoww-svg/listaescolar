import { z } from "zod";

import { CLAIM_METHODS } from "./state";

/** Versão do texto de privacidade aceito (constante do servidor; nunca vem do formulário). */
export const PRIVACY_TEXT_VERSION = "claim-v1";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const methodSchema = z.enum(CLAIM_METHODS);

/** Nota opcional (até 500). Vazio vira `undefined`. */
export const evidenceNoteSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined));

/** O checkbox de aceite chega como "on"/"true"; qualquer outra coisa (ou ausente) é recusada. */
const ackSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal(true)])
  .transform(() => true as const);

export const createClaimInputSchema = z.object({
  method: methodSchema,
  claimantName: trimmed(2, 120),
  claimantRoleTitle: trimmed(2, 80),
  evidenceNote: evidenceNoteSchema,
  privacyAck: ackSchema,
});
export type CreateClaimInput = z.infer<typeof createClaimInputSchema>;

export const submitInputSchema = z.object({ claimId: z.uuid(), evidenceNote: evidenceNoteSchema });

export const decisionInputSchema = z
  .object({
    claimId: z.uuid(),
    to: z.enum(["approved", "insufficient_evidence", "rejected"]),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    const len = v.reason?.length ?? 0;
    if (v.to !== "approved" && (len < 3 || len > 500)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Informe o motivo (3 a 500 caracteres)." });
    }
  });
export type DecisionInput = z.infer<typeof decisionInputSchema>;

/** Token do e-mail: 32 bytes em base64url = 43 caracteres. */
export const emailTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** Código do WhatsApp: exatamente 6 dígitos. */
export const whatsappCodeSchema = z.string().trim().regex(/^[0-9]{6}$/);

export const confirmInputSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("email"), token: emailTokenSchema }),
  z.object({ channel: z.literal("whatsapp"), claimId: z.uuid(), code: whatsappCodeSchema }),
]);
export type ConfirmInput = z.infer<typeof confirmInputSchema>;

export const inepSchema = z.string().regex(/^[0-9]{8}$/);
export const uuidSchema = z.uuid();

export const claimQueueFilterSchema = z.object({
  status: z.enum(["submitted", "awaiting_verification", "token_expired", "insufficient_evidence", "rejected", "approved"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ClaimQueueFilter = z.input<typeof claimQueueFilterSchema>;
