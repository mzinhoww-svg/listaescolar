import { z } from "zod";

/** Excluir conta exige digitar a palavra exata (evita clique acidental num botão de exclusão real e irreversível). */
export const DELETE_ACCOUNT_CONFIRMATION_WORD = "excluir";

export const deleteAccountInputSchema = z.object({
  confirmation: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => s === DELETE_ACCOUNT_CONFIRMATION_WORD, {
      message: `Digite "${DELETE_ACCOUNT_CONFIRMATION_WORD}" para confirmar.`,
    }),
});

export const consentIdInputSchema = z.uuid();
