import type { ClaimMethod } from "./state";

/** Celular BR (DDD + 9 + 8 dígitos, com ou sem `55`). Fixo e lixo não passam. Igual a `claim_school_mobile` no banco. */
export function isBrMobile(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  return /^(55)?[1-9][0-9]9[0-9]{8}$/.test(digits);
}

/** O que o entregador consegue enviar. `null` = nenhum provedor (fora de demo local, até a S11). */
export type SenderCapabilities = { readonly channels: { readonly email: boolean; readonly whatsapp: boolean } } | null;

export type MethodAvailability = { available: true } | { available: false; reason: string };

export const REASON = {
  noEmail: "A escola não tem e-mail registrado no cadastro do INEP.",
  noMobile: "A escola não tem celular registrado no cadastro do INEP.",
  noSender: "Envio indisponível no momento.",
} as const;

/** Disponibilidade dos três métodos, sem revelar o contato. Documentos sempre disponível (revisão humana). */
export function availableMethods(input: {
  hasEmail: boolean;
  phone: string | null | undefined;
  sender: SenderCapabilities;
}): Record<ClaimMethod, MethodAvailability> {
  const email: MethodAvailability = !input.hasEmail
    ? { available: false, reason: REASON.noEmail }
    : input.sender?.channels.email
      ? { available: true }
      : { available: false, reason: REASON.noSender };
  const whatsapp: MethodAvailability = !isBrMobile(input.phone)
    ? { available: false, reason: REASON.noMobile }
    : input.sender?.channels.whatsapp
      ? { available: true }
      : { available: false, reason: REASON.noSender };
  return { institutional_email: email, institutional_whatsapp: whatsapp, documents: { available: true } };
}
