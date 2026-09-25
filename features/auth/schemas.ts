import { z } from "zod";

import { safeNextPath } from "./redirect";

/** E-mail normalizado: sem espaços nas pontas, minúsculas. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const nextSchema = z
  .unknown()
  .optional()
  .transform((v) => safeNextPath(v));

export const magicLinkInputSchema = z.object({ email: emailSchema, next: nextSchema });

export const googleInputSchema = z.object({ next: nextSchema });

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v ? v : undefined))
  .optional();

/** Query do callback OAuth/magic link. `URLSearchParams.get` devolve null quando ausente. */
export const callbackQuerySchema = z.object({
  code: optionalText,
  error: optionalText,
  error_description: optionalText,
  next: nextSchema,
});

/** Query do link mágico (`/auth/confirm`). */
export const confirmQuerySchema = z.object({
  token_hash: optionalText,
  type: z.enum(["email", "magiclink", "signup"]).nullish().transform((v) => v ?? undefined),
  code: optionalText,
  next: nextSchema,
});

export type AuthActionState = {
  status: "idle" | "sent" | "error";
  message?: string;
  /** E-mail normalizado devolvido para o campo não ser limpo após a action. */
  email?: string;
  /** true só para erro de validação do campo (aria-invalid). */
  invalid?: boolean;
};

export const roleSchema = z.enum([
  "parent",
  "school_member",
  "admin",
  "stationery_member",
  "system",
]);
