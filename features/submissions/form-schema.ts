import { z } from "zod";

import { notifyChannelSchema } from "./schemas";
import type { FormErrorCode } from "./copy";

export type SubmitState = { status: "idle" } | { status: "error"; code: FormErrorCode; message: string };
export const idleState: SubmitState = { status: "idle" };

/** Campos de texto do formulário de envio (o arquivo é tratado à parte, antes de ser lido). */
export const submitFieldsSchema = z.object({
  grade: z.string().trim().min(1).max(60),
  schoolYear: z.coerce.number().int().min(2000).max(2100),
  schoolId: z.uuid().optional(),
});

const stripSeparators = (v: string) => v.replace(/[\s().-]/g, "");

/**
 * Normaliza um WhatsApp para E.164 (o CHECK de `jobs.notify_target` exige `+` e 8 a 15 dígitos, sem zero inicial).
 * Números brasileiros de 10 ou 11 dígitos (DDD + número) recebem +55; entradas com `+` mantêm o código informado.
 */
export function toE164(raw: string): string | null {
  const v = stripSeparators(raw);
  if (v.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
  if (/^[1-9][1-9]\d{8,9}$/.test(v)) return `+55${v}`;
  if (/^55[1-9][1-9]\d{8,9}$/.test(v)) return `+${v}`;
  return null;
}

/** Canal de aviso do estado assíncrono. E-mail e WhatsApp exigem destino; navegador não guarda destino. */
export const notifyInputSchema = z
  .object({
    submissionId: z.uuid(),
    channel: notifyChannelSchema.exclude(["none"]),
    target: z.string().trim().max(254).optional(),
  })
  .transform((v, ctx) => {
    if (v.channel === "browser") return { ...v, target: null as string | null };
    if (v.channel === "email") {
      if (!z.email().safeParse(v.target).success) {
        ctx.addIssue({ code: "custom", path: ["target"], message: "Informe um e-mail válido." });
        return z.NEVER;
      }
      return { ...v, target: (v.target as string).toLowerCase() };
    }
    const phone = toE164(v.target ?? "");
    if (!phone) {
      ctx.addIssue({ code: "custom", path: ["target"], message: "Informe um WhatsApp com DDD." });
      return z.NEVER;
    }
    return { ...v, target: phone };
  });
export type NotifyInput = z.output<typeof notifyInputSchema>;

export type NotifyState =
  | { status: "idle" }
  | { status: "saved"; channel: "browser" | "email" | "whatsapp" }
  | { status: "error"; message: string };
