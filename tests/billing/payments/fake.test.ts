import { describe, expect, it } from "vitest";

import { FakePaymentProvider } from "@/features/billing/payments/fake";

describe("FakePaymentProvider", () => {
  it("cria cobrança pendente e reporta status até ser marcada como paga (sem rede)", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const provider = new FakePaymentProvider(() => now);
    const charge = await provider.createCharge({
      invoiceId: "inv-1",
      amountCents: 1000,
      description: "Pacote de crédito",
      expiresInSeconds: 3600,
      payer: { cnpj: "00000000000000", name: "Papelaria Teste" },
    });
    expect(charge.expiresAt.getTime()).toBe(now.getTime() + 3_600_000);
    await expect(provider.getCharge(charge.chargeId)).resolves.toEqual({ status: "pending", paidAmountCents: null, paidAt: null });

    provider.markPaid(charge.chargeId, now);
    await expect(provider.getCharge(charge.chargeId)).resolves.toEqual({ status: "paid", paidAmountCents: 1000, paidAt: now });
  });

  it("cobrança desconhecida devolve status unknown", async () => {
    const provider = new FakePaymentProvider();
    await expect(provider.getCharge("nunca-criada")).resolves.toEqual({ status: "unknown", paidAmountCents: null, paidAt: null });
  });

  it("marcar como paga uma cobrança inexistente falha", () => {
    const provider = new FakePaymentProvider();
    expect(() => provider.markPaid("x")).toThrow();
  });
});
