import { describe, expect, it } from "vitest";

import { readPixConfig, resolvePaymentProvider, type PaymentsEnv } from "@/features/billing/payments/factory";
import { DemoPaymentProvider } from "@/features/billing/payments/demo";
import { PixPaymentProvider } from "@/features/billing/payments/pix";

const PIX_ENV: PaymentsEnv = {
  PAYMENTS_PIX_ENABLED: "1",
  PIX_API_BASE_URL: "https://pix.example.invalid",
  PIX_OAUTH_TOKEN_URL: "https://pix.example.invalid/oauth/token",
  PIX_CLIENT_ID: "client-id",
  PIX_CLIENT_SECRET: "client-secret",
  PIX_CERT_PEM_BASE64: Buffer.from("-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----").toString("base64"),
  PIX_KEY_PEM_BASE64: Buffer.from("-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----").toString("base64"),
  PIX_RECEIVER_KEY: "chave-pix-fake",
  PIX_WEBHOOK_TOKEN: "0123456789abcdef",
  PIX_CHARGE_TTL_SECONDS: "3600",
};

describe("resolvePaymentProvider", () => {
  it("carteira demo em ambiente de demonstração -> demo", () => {
    const p = resolvePaymentProvider({ DEMO_RETAILERS: "1", VERCEL_ENV: "development" }, { isDemo: true });
    expect(p).toBeInstanceOf(DemoPaymentProvider);
  });

  it("carteira demo em produção -> null (nunca demo em produção)", () => {
    const p = resolvePaymentProvider({ DEMO_RETAILERS: "1", VERCEL_ENV: "production" }, { isDemo: true });
    expect(p).toBeNull();
  });

  it("carteira real sem flag Pix -> null", () => {
    expect(resolvePaymentProvider({}, { isDemo: false })).toBeNull();
  });

  it("carteira real com flag mas config incompleta -> null", () => {
    const incomplete: PaymentsEnv = { ...PIX_ENV };
    delete incomplete.PIX_CLIENT_SECRET;
    expect(resolvePaymentProvider(incomplete, { isDemo: false })).toBeNull();
  });

  it("carteira real com flag e config completa -> pix", () => {
    const p = resolvePaymentProvider(PIX_ENV, { isDemo: false });
    expect(p).toBeInstanceOf(PixPaymentProvider);
  });

  it("carteira demo NUNCA cai para pix mesmo com a flag ligada", () => {
    const p = resolvePaymentProvider({ ...PIX_ENV, DEMO_RETAILERS: "1", VERCEL_ENV: "production" }, { isDemo: true });
    expect(p).toBeNull();
  });
});

describe("readPixConfig", () => {
  it("decodifica os PEMs em base64", () => {
    const config = readPixConfig(PIX_ENV);
    expect(config?.certPem).toContain("BEGIN CERTIFICATE");
    expect(config?.keyPem).toContain("BEGIN PRIVATE KEY");
    expect(config?.chargeTtlSeconds).toBe(3600);
  });

  it("null com qualquer variável ausente", () => {
    const rest: PaymentsEnv = { ...PIX_ENV };
    delete rest.PIX_RECEIVER_KEY;
    expect(readPixConfig(rest)).toBeNull();
  });
});
