import { z } from "zod";

import { CLOSE_REASONS } from "./state";

/** Pedido de cotação. Só ids, bairro e o aceite: itens, estudante, demo e solicitante NUNCA vêm do cliente. */
export const CreateLeadInputSchema = z.strictObject({
  cartId: z.uuid(),
  stationeryId: z.uuid(),
  neighborhood: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v)),
  consent: z.literal(true),
  idempotencyKey: z.uuid(),
});
export type CreateLeadInput = z.output<typeof CreateLeadInputSchema>;

const AmountText = z.string().max(40).optional();

export const UpdateStatusInputSchema = z.strictObject({
  to: z.enum(["in_progress", "quote_sent", "awaiting_customer"]),
  amount: AmountText,
});
export const DeclareSaleInputSchema = z.strictObject({ amount: AmountText });
export const CloseLostInputSchema = z.strictObject({ reason: z.enum(CLOSE_REASONS) });
