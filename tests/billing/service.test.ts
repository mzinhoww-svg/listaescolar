import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { BillingError } from "@/features/billing/errors";
import { FakePaymentProvider } from "@/features/billing/payments/fake";
import type { ActivePlan, BillingStore, InvoiceView, PaymentProvider, PlanDraft } from "@/features/billing/ports";
import { BillingService } from "@/features/billing/service";
import type { SessionActor } from "@/features/stationeries/actor";

const MEMBER: SessionActor = { userId: "11111111-1111-4111-8111-111111111111", role: "stationery_member" } as SessionActor;
const ADMIN: SessionActor = { userId: "22222222-2222-4222-8222-222222222222", role: "admin" } as SessionActor;
const STATIONERY_ID = "33333333-3333-4333-8333-333333333333";
const PACKAGE_ID = "44444444-4444-4444-8444-444444444444";

const PLAN: ActivePlan = {
  id: "plan-1",
  version: 1,
  freeLeads: 1,
  freeLeadsValidityDays: null,
  seasonStartMonth: 11,
  seasonEndMonth: 3,
  tiers: [{ minItems: 1, maxItems: null, priceCents: 100 }],
  packages: [{ id: PACKAGE_ID, amountCents: 5000 }],
  pass: { priceCents: 30000, includedLeads: 40, maxInstallments: 3 },
};

function makeStore(over: Partial<BillingStore> = {}): BillingStore {
  const invoices = new Map<string, InvoiceView>();
  const base: BillingStore = {
    getActivePlan: async () => PLAN,
    listPlanHistory: async () => [PLAN],
    publishPlan: async () => "new-plan-id",
    getSummary: async () => ({ available: false }),
    listStatement: async () => [],
    listInvoices: async () => [...invoices.values()],
    getInvoice: async (_actor, _stationeryId, invoiceId) => invoices.get(invoiceId) ?? null,
    listSeasonPasses: async () => [],
    createPackageInvoice: async (_actor, input) => {
      const id = randomUUID();
      invoices.set(id, {
        id,
        kind: "credit_package",
        seasonPassId: null,
        installmentNo: null,
        amountCents: 5000,
        dueDate: "2026-06-10",
        status: "open",
        provider: input.provider,
        isDemo: input.provider !== "pix",
        pixCopyPaste: null,
        chargeExpiresAt: null,
        paidAt: null,
        paidAmountCents: null,
        createdAt: new Date(),
      });
      return id;
    },
    purchaseSeasonPass: async (_actor, input) => {
      const passId = randomUUID();
      for (let n = 1; n <= input.installments; n++) {
        const id = randomUUID();
        invoices.set(id, {
          id,
          kind: "season_pass_installment",
          seasonPassId: passId,
          installmentNo: n,
          amountCents: 10000,
          dueDate: "2026-06-10",
          status: "open",
          provider: input.provider,
          isDemo: input.provider !== "pix",
          pixCopyPaste: null,
          chargeExpiresAt: null,
          paidAt: null,
          paidAmountCents: null,
          createdAt: new Date(),
        });
      }
      return passId;
    },
    attachCharge: async () => true,
    confirmInvoicePayment: async (input) => {
      const inv = invoices.get(input.invoiceId);
      if (inv) invoices.set(input.invoiceId, { ...inv, status: "paid", paidAt: input.paidAt, paidAmountCents: input.amountCents });
      return true;
    },
    reverseEntry: async () => randomUUID(),
    getStationeryBillingInfo: async () => ({ isDemo: false, cnpj: "00000000000000", tradeName: "Papelaria Teste" }),
    findOpenInvoiceByChargeId: async () => null,
    listOpenPixChargeIds: async () => [],
  };
  return { ...base, ...over };
}

function makeService(storeOver: Partial<BillingStore> = {}, providerFor: (w: { isDemo: boolean }) => PaymentProvider | null = () => new FakePaymentProvider()) {
  return new BillingService({ store: makeStore(storeOver), providerFor, now: () => new Date("2026-06-10T12:00:00Z") });
}

describe("BillingService.publishPlan", () => {
  it("admin publica; faixas inválidas nem chegam ao repositório", async () => {
    let called = false;
    const service = makeService({ publishPlan: async () => ((called = true), "id") });
    const draft: PlanDraft = { freeLeads: 1, freeLeadsValidityDays: null, season: { startMonth: 11, endMonth: 3 }, tiers: [{ minItems: 2, maxItems: null, priceCents: 100 }], packages: [{ amountCents: 100 }], pass: null };
    await expect(service.publishPlan(ADMIN, draft)).rejects.toMatchObject({ code: "invalid_plan" });
    expect(called).toBe(false);
  });

  it("não-admin é recusado", async () => {
    const service = makeService();
    await expect(service.publishPlan(MEMBER, { freeLeads: 1, freeLeadsValidityDays: null, season: { startMonth: 11, endMonth: 3 }, tiers: [{ minItems: 1, maxItems: null, priceCents: 100 }], packages: [{ amountCents: 100 }], pass: null })).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("admin com faixas válidas publica", async () => {
    const service = makeService();
    const id = await service.publishPlan(ADMIN, { freeLeads: 1, freeLeadsValidityDays: null, season: { startMonth: 11, endMonth: 3 }, tiers: [{ minItems: 1, maxItems: null, priceCents: 100 }], packages: [{ amountCents: 100 }], pass: null });
    expect(id).toBe("new-plan-id");
  });
});

describe("BillingService.buyPackage", () => {
  it("sem aceite -> consent_required sem chamar o repositório", async () => {
    let called = false;
    const service = makeService({ createPackageInvoice: async () => ((called = true), "x") });
    await expect(service.buyPackage(MEMBER, { stationeryId: STATIONERY_ID, packageId: PACKAGE_ID, idempotencyKey: randomUUID(), termsAccepted: false })).rejects.toMatchObject({
      code: "consent_required",
    });
    expect(called).toBe(false);
  });

  it("sem provedor disponível -> payments_unavailable, nada gravado", async () => {
    let called = false;
    const service = makeService({ createPackageInvoice: async () => ((called = true), "x") }, () => null);
    await expect(service.buyPackage(MEMBER, { stationeryId: STATIONERY_ID, packageId: PACKAGE_ID, idempotencyKey: randomUUID(), termsAccepted: true })).rejects.toMatchObject({
      code: "payments_unavailable",
    });
    expect(called).toBe(false);
  });

  it("com aceite e provedor fake, cria a fatura", async () => {
    const service = makeService();
    const result = await service.buyPackage(MEMBER, { stationeryId: STATIONERY_ID, packageId: PACKAGE_ID, idempotencyKey: randomUUID(), termsAccepted: true });
    expect(result.invoiceId).toBeTruthy();
    expect(result.provider).toBe("fake");
    expect(result.pixCopyPaste).toBeNull(); // fake nunca gera BR Code
  });

  it("papelaria inexistente -> not_found", async () => {
    const service = makeService({ getStationeryBillingInfo: async () => null });
    await expect(service.buyPackage(MEMBER, { stationeryId: STATIONERY_ID, packageId: PACKAGE_ID, idempotencyKey: randomUUID(), termsAccepted: true })).rejects.toMatchObject({ code: "not_found" });
  });

  it("dados inválidos são recusados antes de tocar o repositório", async () => {
    const service = makeService();
    await expect(service.buyPackage(MEMBER, { stationeryId: "não-é-uuid" })).rejects.toBeInstanceOf(BillingError);
  });
});

describe("BillingService.buyPass", () => {
  it("gera a 1ª parcela e a lista de parcelas", async () => {
    const service = makeService();
    const result = await service.buyPass(MEMBER, { stationeryId: STATIONERY_ID, installments: 3, idempotencyKey: randomUUID(), termsAccepted: true });
    expect(result.installments).toHaveLength(3);
    expect(result.installments[0]!.installmentNo).toBe(1);
  });
});

describe("BillingService.simulateDemoPayment", () => {
  it("confirma a fatura demo direto (sem consultar getCharge)", async () => {
    const invoiceId = randomUUID();
    const service = makeService(
      {
        getStationeryBillingInfo: async () => ({ isDemo: true, cnpj: "00000000000000", tradeName: "Demo" }),
        getInvoice: async () => ({
          id: invoiceId,
          kind: "credit_package",
          seasonPassId: null,
          installmentNo: null,
          amountCents: 5000,
          dueDate: "2026-06-10",
          status: "open",
          provider: "demo",
          isDemo: true,
          pixCopyPaste: null,
          chargeExpiresAt: null,
          paidAt: null,
          paidAmountCents: null,
          createdAt: new Date(),
        }),
      },
      () => ({ id: "demo", createCharge: async () => ({ chargeId: "x", copyPaste: null, expiresAt: new Date() }), getCharge: async () => ({ status: "pending", paidAmountCents: null, paidAt: null }) }),
    );
    await expect(service.simulateDemoPayment(MEMBER, { stationeryId: STATIONERY_ID, invoiceId })).resolves.toBe(true);
  });

  it("recusa para carteira real", async () => {
    const service = makeService();
    await expect(service.simulateDemoPayment(MEMBER, { stationeryId: STATIONERY_ID, invoiceId: randomUUID() })).rejects.toMatchObject({ code: "provider_invalid" });
  });
});

describe("BillingService.reconcileInvoiceByChargeId", () => {
  it("só confirma com status pago e valor igual (reconsulta, nunca confia no corpo)", async () => {
    const invoiceId = randomUUID();
    const provider: PaymentProvider = { id: "pix", createCharge: vi.fn(), getCharge: async () => ({ status: "paid", paidAmountCents: 5000, paidAt: new Date() }) };
    let confirmed = false;
    const service = makeService(
      { findOpenInvoiceByChargeId: async () => ({ invoiceId, amountCents: 5000 }), confirmInvoicePayment: async () => ((confirmed = true), true) },
      () => provider,
    );
    const result = await service.reconcileInvoiceByChargeId("txid-1");
    expect(result).toEqual({ invoiceId, confirmed: true });
    expect(confirmed).toBe(true);
  });

  it("valor diferente não confirma", async () => {
    const invoiceId = randomUUID();
    const provider: PaymentProvider = { id: "pix", createCharge: vi.fn(), getCharge: async () => ({ status: "paid", paidAmountCents: 999, paidAt: new Date() }) };
    let confirmed = false;
    const service = makeService(
      { findOpenInvoiceByChargeId: async () => ({ invoiceId, amountCents: 5000 }), confirmInvoicePayment: async () => ((confirmed = true), true) },
      () => provider,
    );
    const result = await service.reconcileInvoiceByChargeId("txid-1");
    expect(result?.confirmed).toBe(false);
    expect(confirmed).toBe(false);
  });

  it("cobrança desconhecida -> null", async () => {
    const service = makeService({ findOpenInvoiceByChargeId: async () => null });
    await expect(service.reconcileInvoiceByChargeId("nunca")).resolves.toBeNull();
  });
});
