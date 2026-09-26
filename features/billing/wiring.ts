import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { resolvePaymentProvider, type PaymentsEnv } from "./payments/factory";
import { createBillingStore } from "./repository";
import { BillingService } from "./service";

export function readPaymentsEnv(): PaymentsEnv {
  return {
    DEMO_RETAILERS: process.env.DEMO_RETAILERS,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    PAYMENTS_PIX_ENABLED: process.env.PAYMENTS_PIX_ENABLED,
    PIX_API_BASE_URL: process.env.PIX_API_BASE_URL,
    PIX_OAUTH_TOKEN_URL: process.env.PIX_OAUTH_TOKEN_URL,
    PIX_CLIENT_ID: process.env.PIX_CLIENT_ID,
    PIX_CLIENT_SECRET: process.env.PIX_CLIENT_SECRET,
    PIX_CERT_PEM_BASE64: process.env.PIX_CERT_PEM_BASE64,
    PIX_KEY_PEM_BASE64: process.env.PIX_KEY_PEM_BASE64,
    PIX_RECEIVER_KEY: process.env.PIX_RECEIVER_KEY,
    PIX_WEBHOOK_TOKEN: process.env.PIX_WEBHOOK_TOKEN,
    PIX_CHARGE_TTL_SECONDS: process.env.PIX_CHARGE_TTL_SECONDS,
  };
}

/** Composição do serviço de cobrança (repositório real + fábrica de `PaymentProvider` sobre o ambiente do processo). */
export function getBillingService(): BillingService {
  const env = readPaymentsEnv();
  return new BillingService({
    store: createBillingStore(createAdminClient()),
    providerFor: (wallet) => resolvePaymentProvider(env, wallet),
    now: () => new Date(),
  });
}
