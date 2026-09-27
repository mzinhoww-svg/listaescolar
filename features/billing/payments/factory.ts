import { type DemoEnv } from "@/features/cart/demo-provider";

import { pixConfigSchema } from "../schemas";
import type { PaymentProvider } from "../ports";
import { DemoPaymentProvider } from "./demo";
import { PixPaymentProvider } from "./pix";

export type PaymentsEnv = DemoEnv & {
  PAYMENTS_PIX_ENABLED?: string;
  PIX_API_BASE_URL?: string;
  PIX_OAUTH_TOKEN_URL?: string;
  PIX_CLIENT_ID?: string;
  PIX_CLIENT_SECRET?: string;
  PIX_CERT_PEM_BASE64?: string;
  PIX_KEY_PEM_BASE64?: string;
  PIX_RECEIVER_KEY?: string;
  PIX_WEBHOOK_TOKEN?: string;
  PIX_CHARGE_TTL_SECONDS?: string;
};

function decodeBase64Pem(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

/** Config Pix a partir do ambiente; `undefined` se qualquer variável faltar ou o PEM não decodificar. */
export function readPixConfig(env: PaymentsEnv) {
  const parsed = pixConfigSchema.safeParse({
    apiBaseUrl: env.PIX_API_BASE_URL,
    oauthTokenUrl: env.PIX_OAUTH_TOKEN_URL,
    clientId: env.PIX_CLIENT_ID,
    clientSecret: env.PIX_CLIENT_SECRET,
    certPem: decodeBase64Pem(env.PIX_CERT_PEM_BASE64),
    keyPem: decodeBase64Pem(env.PIX_KEY_PEM_BASE64),
    receiverKey: env.PIX_RECEIVER_KEY,
    webhookToken: env.PIX_WEBHOOK_TOKEN,
    chargeTtlSeconds: env.PIX_CHARGE_TTL_SECONDS ? Number(env.PIX_CHARGE_TTL_SECONDS) : undefined,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Escolhe o `PaymentProvider`: carteira de demonstração + ambiente de demonstração -> `demo` (nunca em produção,
 * nunca para carteira real); senão, com `PAYMENTS_PIX_ENABLED=1` e config Pix completa -> `pix`; senão `null`
 * (Pap06 mostra "Pagamento via Pix indisponível no momento" e os botões ficam desabilitados).
 */
export function resolvePaymentProvider(env: PaymentsEnv, wallet: { isDemo: boolean }): PaymentProvider | null {
  if (wallet.isDemo) {
    try {
      return new DemoPaymentProvider({ isDemo: true, env });
    } catch {
      return null;
    }
  }
  if (env.PAYMENTS_PIX_ENABLED !== "1") return null;
  const config = readPixConfig(env);
  if (!config) return null;
  return new PixPaymentProvider(config);
}
