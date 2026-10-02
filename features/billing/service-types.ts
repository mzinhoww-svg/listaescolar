import type { BillingStore, PaymentProvider } from "./ports";

/**
 * D-158 (S19): tipos de `service.ts` extraídos para um arquivo próprio, para `service-pix.ts` (funções de
 * cobrança Pix/reconciliação extraídas do `BillingService`) poder importá-los sem depender de `service.ts`
 * (evita import circular: `service.ts` também importa de `service-pix.ts`).
 */
export type BillingServiceDeps = {
  store: BillingStore;
  /** `resolvePaymentProvider` já parcialmente aplicado ao ambiente do processo (fábrica em `payments/factory.ts`). */
  providerFor: (wallet: { isDemo: boolean }) => PaymentProvider | null;
  now: () => Date;
};

export type PurchaseResult = { invoiceId: string; pixCopyPaste: string | null; chargeExpiresAt: Date | null; provider: PaymentProvider["id"] };
