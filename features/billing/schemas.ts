import { z } from "zod";

import {
  BILLING_MAX_AMOUNT_CENTS,
  BILLING_MIN_AMOUNT_CENTS,
  FREE_LEADS_MAX,
  FREE_LEADS_MIN,
  FREE_LEADS_VALIDITY_MAX_DAYS,
  FREE_LEADS_VALIDITY_MIN_DAYS,
  ITEM_COUNT_MAX,
  ITEM_COUNT_MIN,
  PACKAGES_MAX,
  PACKAGES_MIN,
  PASS_INSTALLMENTS_MAX,
  PASS_INSTALLMENTS_MIN,
  SEASON_MONTH_MAX,
  SEASON_MONTH_MIN,
} from "./limits";

const cents = z.number().int().min(BILLING_MIN_AMOUNT_CENTS).max(BILLING_MAX_AMOUNT_CENTS);

export const tierDraftSchema = z
  .object({
    minItems: z.number().int().min(ITEM_COUNT_MIN).max(ITEM_COUNT_MAX),
    maxItems: z.number().int().min(ITEM_COUNT_MIN).max(ITEM_COUNT_MAX).nullable(),
    priceCents: cents,
  })
  .strict();

export const packageDraftSchema = z.object({ amountCents: cents }).strict();

export const passDraftSchema = z
  .object({
    priceCents: cents,
    includedLeads: z.number().int().min(1),
    maxInstallments: z.number().int().min(PASS_INSTALLMENTS_MIN).max(PASS_INSTALLMENTS_MAX),
  })
  .strict();

/** Fronteira do formulário Admin10 (`publishPlan`). Validação fina das faixas fica em `validateTiers`. */
export const planDraftSchema = z
  .object({
    freeLeads: z.number().int().min(FREE_LEADS_MIN).max(FREE_LEADS_MAX),
    freeLeadsValidityDays: z.number().int().min(FREE_LEADS_VALIDITY_MIN_DAYS).max(FREE_LEADS_VALIDITY_MAX_DAYS).nullable(),
    season: z
      .object({
        startMonth: z.number().int().min(SEASON_MONTH_MIN).max(SEASON_MONTH_MAX),
        endMonth: z.number().int().min(SEASON_MONTH_MIN).max(SEASON_MONTH_MAX),
      })
      .strict(),
    tiers: z.array(tierDraftSchema).min(1),
    packages: z.array(packageDraftSchema).min(PACKAGES_MIN).max(PACKAGES_MAX),
    pass: passDraftSchema.nullable(),
  })
  .strict();

export const providerSchema = z.enum(["fake", "demo", "pix"]);

// `provider` NUNCA vem do cliente: o servidor escolhe com `resolvePaymentProvider(env, wallet)` (carteira demo -> demo;
// senão Pix atrás da flag). Aceitar o provedor por entrada abriria a possibilidade de o cliente escolher "pix" para
// uma carteira demo (o banco já recusaria pelo CHECK, mas a decisão é do servidor, não uma opção de formulário).
export const buyPackageInputSchema = z.object({ stationeryId: z.uuid(), packageId: z.uuid(), idempotencyKey: z.uuid(), termsAccepted: z.boolean() }).strict();

export const buyPassInputSchema = z
  .object({
    stationeryId: z.uuid(),
    installments: z.number().int().min(PASS_INSTALLMENTS_MIN).max(PASS_INSTALLMENTS_MAX),
    idempotencyKey: z.uuid(),
    termsAccepted: z.boolean(),
  })
  .strict();

export const payInvoiceInputSchema = z.object({ stationeryId: z.uuid(), invoiceId: z.uuid() }).strict();
export const simulateDemoPaymentInputSchema = z.object({ stationeryId: z.uuid(), invoiceId: z.uuid() }).strict();

/** Config completa do adapter Pix, só por variável de ambiente (nunca literal no código). */
export const pixConfigSchema = z.object({
  apiBaseUrl: z.url(),
  oauthTokenUrl: z.url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  certPem: z.string().min(1),
  keyPem: z.string().min(1),
  receiverKey: z.string().min(1),
  webhookToken: z.string().min(16),
  chargeTtlSeconds: z.number().int().positive(),
});
export type PixConfig = z.infer<typeof pixConfigSchema>;

/** Resposta do PSP Pix a `PUT/GET /v2/cob/{txid}` — só os campos usados; nunca confiamos no corpo do webhook. */
export const pixCobResponseSchema = z
  .object({
    txid: z.string().min(26).max(35),
    status: z.string(),
    valor: z.object({ original: z.string() }),
    pixCopiaECola: z.string().optional(),
    calendario: z.object({ criacao: z.string(), expiracao: z.number().int().positive() }),
    pix: z.array(z.object({ horario: z.string() })).optional(),
  })
  .passthrough();

/** `POST /api/billing/pix/webhook`: o corpo só diz QUAL cobrança mudou; o valor nunca vem do corpo. */
export const pixWebhookBodySchema = z
  .object({
    pix: z.array(z.object({ txid: z.string().min(1) })).optional(),
    txid: z.string().min(1).optional(),
  })
  .passthrough();
