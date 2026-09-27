import { z } from "zod";

import { ALLOWED_SCOPES } from "./scopes";
import { KEY_ROTATION_GRACE_DAYS, PARTNER_LIVE_RATE_PER_DAY, PARTNER_LIVE_RATE_PER_MINUTE, PARTNER_TEST_RATE_PER_DAY, PARTNER_TEST_RATE_PER_MINUTE } from "./limits";
import { PARTNER_STATUSES } from "./states";

// Zod em toda fronteira do domínio B2B (formulário do cadastro, decisão do admin, ações de chave). `.strict()`
// sempre: campo extra é erro de programação do cliente, nunca silenciosamente ignorado.

export const BRAZIL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const ufSchema = z.enum(BRAZIL_UFS);
const coverageUfsSchema = z.array(ufSchema).min(1).max(27).nullable();

export const ApplyPartnerInputSchema = z
  .object({
    tradeName: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(200),
    cnpj: z.string().min(1).max(20),
    contactName: z.string().trim().min(1).max(120),
    partnerType: z.enum(["retailer", "brand", "edtech"]),
    coverageUfs: coverageUfsSchema.optional(),
    termsAccepted: z.literal(true),
  })
  .strict();
export type ApplyPartnerInput = z.infer<typeof ApplyPartnerInputSchema>;

const rateRange = (r: { min: number; max: number }) => z.number().int().min(r.min).max(r.max);

export const DecidePartnerInputSchema = z
  .object({
    to: z.enum(PARTNER_STATUSES),
    plan: z.enum(["sandbox", "regional", "national", "brand_campaigns", "edtech_integration"]).optional(),
    coverageUfs: coverageUfsSchema.optional(),
    testRatePerMinute: rateRange(PARTNER_TEST_RATE_PER_MINUTE).optional(),
    testRatePerDay: rateRange(PARTNER_TEST_RATE_PER_DAY).optional(),
    liveRatePerMinute: rateRange(PARTNER_LIVE_RATE_PER_MINUTE).optional(),
    liveRatePerDay: rateRange(PARTNER_LIVE_RATE_PER_DAY).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type DecidePartnerInput = z.infer<typeof DecidePartnerInputSchema>;

export const CreateKeyInputSchema = z
  .object({
    environment: z.enum(["test", "live"]),
    scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1).max(ALLOWED_SCOPES.length),
  })
  .strict();
export type CreateKeyInput = z.infer<typeof CreateKeyInputSchema>;

export const RotateKeyInputSchema = z
  .object({
    keyId: z.uuid(),
    graceDays: z.number().int().min(KEY_ROTATION_GRACE_DAYS.min).max(KEY_ROTATION_GRACE_DAYS.max).optional(),
  })
  .strict();
export type RotateKeyInput = z.infer<typeof RotateKeyInputSchema>;

export const RevokeKeyInputSchema = z
  .object({
    keyId: z.uuid(),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type RevokeKeyInput = z.infer<typeof RevokeKeyInputSchema>;

export const AdminRevokeKeyInputSchema = RevokeKeyInputSchema;
export type AdminRevokeKeyInput = z.infer<typeof AdminRevokeKeyInputSchema>;
