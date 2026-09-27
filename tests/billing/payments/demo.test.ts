import { describe, expect, it } from "vitest";

import { DemoPaymentProvider } from "@/features/billing/payments/demo";

const DEV_ENV = { DEMO_RETAILERS: "1", VERCEL_ENV: "development" };

describe("DemoPaymentProvider", () => {
  it("funciona para carteira demo em ambiente de demonstração", async () => {
    const provider = new DemoPaymentProvider({ isDemo: true, env: DEV_ENV });
    const charge = await provider.createCharge({
      invoiceId: "inv-1",
      amountCents: 500,
      description: "Pacote",
      expiresInSeconds: 60,
      payer: { cnpj: "00000000000000", name: "Papelaria Demo" },
    });
    expect(charge.copyPaste).toBeNull();
    await expect(provider.getCharge(charge.chargeId)).resolves.toMatchObject({ status: "pending" });
  });

  it("recusa carteira que não é de demonstração", () => {
    expect(() => new DemoPaymentProvider({ isDemo: false, env: DEV_ENV })).toThrow();
  });

  it("recusa em produção mesmo com carteira demo", () => {
    expect(() => new DemoPaymentProvider({ isDemo: true, env: { DEMO_RETAILERS: "1", VERCEL_ENV: "production" } })).toThrow();
  });

  it("recusa sem DEMO_RETAILERS=1", () => {
    expect(() => new DemoPaymentProvider({ isDemo: true, env: { VERCEL_ENV: "development" } })).toThrow();
  });
});
