import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
const svc = {
  buyPackage: vi.fn(),
  buyPass: vi.fn(),
  payInvoice: vi.fn(),
  simulateDemoPayment: vi.fn(),
};
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser(), getCurrentRole: () => getCurrentRole() }));
vi.mock("@/features/billing/wiring", () => ({ getBillingService: () => svc }));

import { buyPackageAction, buyPassAction, payInvoiceAction, simulateDemoPaymentAction } from "@/features/billing/actions";
import { BillingError } from "@/features/billing/errors";

const USER = "22222222-2222-4222-8222-222222222222";
const STATIONERY = "44444444-4444-4444-8444-444444444444";
const PACKAGE = "55555555-5555-4555-8555-555555555555";
const INVOICE = "66666666-6666-4666-8666-666666666666";
const KEY = "77777777-7777-4777-8777-777777777777";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

async function redirected(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const m = /^REDIRECT:(.*)$/.exec((err as Error).message);
  if (!m) throw err;
  return m[1]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: USER, email: "dona@example.test" });
  getCurrentRole.mockResolvedValue("stationery_member");
});

describe("buyPackageAction", () => {
  it("sem sessão: vai ao login", async () => {
    getCurrentUser.mockResolvedValue(null);
    const to = await redirected(buyPackageAction(form({ stationeryId: STATIONERY, packageId: PACKAGE })));
    expect(to).toContain("/entrar?next=");
    expect(svc.buyPackage).not.toHaveBeenCalled();
  });

  it("sucesso: vai para a fatura criada", async () => {
    svc.buyPackage.mockResolvedValue({ invoiceId: INVOICE, provider: "demo", pixCopyPaste: null, chargeExpiresAt: null });
    const to = await redirected(buyPackageAction(form({ stationeryId: STATIONERY, packageId: PACKAGE, idempotencyKey: KEY, termsAccepted: "on" })));
    expect(to).toBe(`/papelaria/creditos/faturas/${INVOICE}`);
    expect(svc.buyPackage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
      expect.objectContaining({ stationeryId: STATIONERY, packageId: PACKAGE, idempotencyKey: KEY, termsAccepted: true }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/papelaria/creditos");
  });

  it("erro do serviço: volta para a página com ?erro=<código>", async () => {
    svc.buyPackage.mockRejectedValue(new BillingError("sem saldo", "consent_required"));
    const to = await redirected(buyPackageAction(form({ stationeryId: STATIONERY, packageId: PACKAGE, idempotencyKey: KEY })));
    expect(to).toBe("/papelaria/creditos?erro=consent_required");
  });

  it("revisão de segurança: chave de idempotência ausente/inválida — erro sem chamar o serviço (nunca gera chave nova no servidor)", async () => {
    const to = await redirected(buyPackageAction(form({ stationeryId: STATIONERY, packageId: PACKAGE })));
    expect(to).toBe("/papelaria/creditos?erro=invalid_input");
    expect(svc.buyPackage).not.toHaveBeenCalled();
  });

  it("revisão de segurança: admin não compra em nome da papelaria — 403 sem chamar o serviço", async () => {
    getCurrentRole.mockResolvedValue("admin");
    const to = await redirected(buyPackageAction(form({ stationeryId: STATIONERY, packageId: PACKAGE, idempotencyKey: KEY, termsAccepted: "on" })));
    expect(to).toBe("/403");
    expect(svc.buyPackage).not.toHaveBeenCalled();
  });
});

describe("buyPassAction", () => {
  it("número de parcelas inválido: erro sem chamar o serviço", async () => {
    const to = await redirected(buyPassAction(form({ stationeryId: STATIONERY, installments: "9", idempotencyKey: KEY })));
    expect(to).toContain("erro=invalid_input");
    expect(svc.buyPass).not.toHaveBeenCalled();
  });

  it("chave de idempotência ausente/inválida: erro sem chamar o serviço", async () => {
    const to = await redirected(buyPassAction(form({ stationeryId: STATIONERY, installments: "3" })));
    expect(to).toContain("erro=invalid_input");
    expect(svc.buyPass).not.toHaveBeenCalled();
  });

  it("sucesso: vai para a fatura da 1ª parcela", async () => {
    svc.buyPass.mockResolvedValue({ invoiceId: INVOICE, provider: "pix", pixCopyPaste: "copia-e-cola", chargeExpiresAt: new Date(), installments: [] });
    const to = await redirected(buyPassAction(form({ stationeryId: STATIONERY, installments: "3", idempotencyKey: KEY, termsAccepted: "on" })));
    expect(to).toBe(`/papelaria/creditos/faturas/${INVOICE}`);
    expect(svc.buyPass).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }), expect.objectContaining({ idempotencyKey: KEY }));
  });

  it("admin não assina passe em nome da papelaria — 403 sem chamar o serviço", async () => {
    getCurrentRole.mockResolvedValue("admin");
    const to = await redirected(buyPassAction(form({ stationeryId: STATIONERY, installments: "3", idempotencyKey: KEY, termsAccepted: "on" })));
    expect(to).toBe("/403");
    expect(svc.buyPass).not.toHaveBeenCalled();
  });
});

describe("payInvoiceAction", () => {
  it("sucesso: revalida e volta para a fatura", async () => {
    svc.payInvoice.mockResolvedValue({ pixCopyPaste: "x", chargeExpiresAt: new Date() });
    const to = await redirected(payInvoiceAction(form({ stationeryId: STATIONERY, invoiceId: INVOICE })));
    expect(to).toBe(`/papelaria/creditos/faturas/${INVOICE}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/papelaria/creditos/faturas/${INVOICE}`);
  });

  it("erro: ?erro=<código> na fatura", async () => {
    svc.payInvoice.mockRejectedValue(new BillingError("sem provedor", "payments_unavailable"));
    const to = await redirected(payInvoiceAction(form({ stationeryId: STATIONERY, invoiceId: INVOICE })));
    expect(to).toBe(`/papelaria/creditos/faturas/${INVOICE}?erro=payments_unavailable`);
  });

  it("revisão de segurança: admin não gera cobrança em nome da papelaria — 403 sem chamar o serviço", async () => {
    getCurrentRole.mockResolvedValue("admin");
    const to = await redirected(payInvoiceAction(form({ stationeryId: STATIONERY, invoiceId: INVOICE })));
    expect(to).toBe("/403");
    expect(svc.payInvoice).not.toHaveBeenCalled();
  });
});

describe("simulateDemoPaymentAction", () => {
  it("sucesso: ?ok=1 na fatura", async () => {
    svc.simulateDemoPayment.mockResolvedValue(true);
    const to = await redirected(simulateDemoPaymentAction(form({ stationeryId: STATIONERY, invoiceId: INVOICE })));
    expect(to).toBe(`/papelaria/creditos/faturas/${INVOICE}?ok=1`);
  });

  it("recusa carteira real: ?erro=provider_invalid", async () => {
    svc.simulateDemoPayment.mockRejectedValue(new BillingError("carteira real", "provider_invalid"));
    const to = await redirected(simulateDemoPaymentAction(form({ stationeryId: STATIONERY, invoiceId: INVOICE })));
    expect(to).toBe(`/papelaria/creditos/faturas/${INVOICE}?erro=provider_invalid`);
  });

  it("revisão de segurança: admin não simula pagamento em nome da papelaria — 403 sem chamar o serviço", async () => {
    getCurrentRole.mockResolvedValue("admin");
    const to = await redirected(simulateDemoPaymentAction(form({ stationeryId: STATIONERY, invoiceId: INVOICE })));
    expect(to).toBe("/403");
    expect(svc.simulateDemoPayment).not.toHaveBeenCalled();
  });
});
