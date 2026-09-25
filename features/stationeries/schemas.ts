import { z } from "zod";

import { isValidCnpj, cnpjDigits } from "./cnpj";
import { normalizeCep, normalizePhone } from "./phone";

export const PAYMENT_METHODS = ["pix", "credit_card", "debit_card", "cash", "boleto"] as const;
export const LGPD_TEXT_VERSION = "lgpd-papelaria-v1";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const phoneField = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return undefined;
      const n = normalizePhone(v);
      if (!n) ctx.addIssue({ code: "custom", message: `${label} inválido. Use DDD e número.` });
      return n ?? undefined;
    })
    .optional();

/** Passo 1 do stepper: identificação. */
export const StationeryBasicsSchema = z.object({
  tradeName: text(120).min(2, "Informe o nome fantasia."),
  legalName: text(200).min(2, "Informe a razão social."),
  cnpj: z
    .string()
    .trim()
    .refine(isValidCnpj, "CNPJ inválido.")
    .transform(cnpjDigits),
  municipalityId: z.uuid("Selecione o município."),
  neighborhood: text(120).min(2, "Informe o bairro."),
  address: optionalText(200),
  cep: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return undefined;
      const n = normalizeCep(v);
      if (!n) ctx.addIssue({ code: "custom", message: "CEP inválido." });
      return n ?? undefined;
    })
    .optional(),
});

/** Passo 2: contato e atendimento. */
export const StationeryServiceSchema = z
  .object({
    whatsapp: z
      .string()
      .trim()
      .min(1, "Informe o WhatsApp.")
      .transform((v, ctx) => {
        const n = normalizePhone(v);
        if (!n) ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD e número." });
        return n ?? "";
      }),
    phone: phoneField("Telefone"),
    email: z
      .string()
      .trim()
      .max(254)
      .transform((v) => (v === "" ? undefined : v))
      .refine((v) => v === undefined || z.email().safeParse(v).success, "E-mail inválido.")
      .optional(),
    offersPickup: z.boolean().default(false),
    offersDelivery: z.boolean().default(false),
    serviceRadiusKm: z.coerce.number().int().min(0).max(50).default(0),
    openingHours: optionalText(300),
    paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length).default([]),
    areas: z.array(text(120).min(2)).max(100).default([]),
  })
  .refine((v) => v.offersPickup || v.offersDelivery || v.areas.length > 0, {
    message: "Informe retirada, entrega ou ao menos um bairro atendido.",
    path: ["offersPickup"],
  });

/** Passo 3: aceite LGPD. */
export const StationeryConsentSchema = z.object({
  lgpdAccepted: z.literal(true, { error: "É preciso aceitar o tratamento de dados." }),
  lgpdTextVersion: z.string().trim().min(1).default(LGPD_TEXT_VERSION),
});

/** Cadastro completo (soma dos passos). O envio à análise depende da equipe: cadastro não é verificação. */
export const StationeryRegistrationSchema = z.object({
  basics: StationeryBasicsSchema,
  service: StationeryServiceSchema,
  consent: StationeryConsentSchema,
});
export const STATIONERY_STEP_SCHEMAS = {
  basics: StationeryBasicsSchema,
  service: StationeryServiceSchema,
  consent: StationeryConsentSchema,
} as const;

export type StationeryBasics = z.output<typeof StationeryBasicsSchema>;
export type StationeryService = z.output<typeof StationeryServiceSchema>;
export type StationeryConsent = z.output<typeof StationeryConsentSchema>;
export type StationeryRegistration = z.output<typeof StationeryRegistrationSchema>;

export const StatusTransitionSchema = z.object({
  to: z.enum(["signup", "accreditation", "under_review", "approved", "active", "paused", "suspended", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});
