import type { SessionActor } from "@/features/stationeries/actor";

import type { PriceTier } from "./tiers";

// ---------------------------------------------------------------------------
// Leitura (plano, carteira, extrato, faturas, passe)
// ---------------------------------------------------------------------------

export type PlanPackage = { id: string; amountCents: number };
export type PassConfig = { priceCents: number; includedLeads: number; maxInstallments: number };
export type ActivePlan = {
  id: string;
  version: number;
  freeLeads: number;
  freeLeadsValidityDays: number | null;
  seasonStartMonth: number;
  seasonEndMonth: number;
  tiers: PriceTier[];
  packages: PlanPackage[];
  pass: PassConfig | null;
};

export type ActivePassSummary = { id: string; includedLeads: number; leadsLeft: number; seasonStart: string; seasonEnd: string };
export type WalletSummary =
  | { available: false }
  | {
      available: true;
      balanceCents: number;
      freeGranted: number;
      freeLeft: number;
      freeExpiresAt: Date | null;
      planVersion: number;
      activePass: ActivePassSummary | null;
      canReceiveMinTier: boolean;
      minTierPriceCents: number | null;
    };

export type LedgerEntryType = "topup" | "lead_debit" | "free_lead" | "pass_lead" | "reversal";
export type LedgerEntryView = {
  id: string;
  entryType: LedgerEntryType;
  amountCents: number;
  balanceAfterCents: number;
  leadId: string | null;
  leadCode: string | null;
  schoolName: string | null;
  invoiceId: string | null;
  itemCount: number | null;
  reason: string | null;
  reversed: boolean;
  createdAt: Date;
};

export type InvoiceStatus = "open" | "paid" | "cancelled";
export type InvoiceProvider = "fake" | "demo" | "pix";
export type InvoiceView = {
  id: string;
  kind: "credit_package" | "season_pass_installment";
  seasonPassId: string | null;
  installmentNo: number | null;
  amountCents: number;
  dueDate: string;
  status: InvoiceStatus;
  provider: InvoiceProvider;
  isDemo: boolean;
  /** Txid/id da cobrança ATUAL no PSP (interno; nunca exposto pela grant de coluna a `authenticated`). */
  providerChargeId: string | null;
  pixCopyPaste: string | null;
  chargeExpiresAt: Date | null;
  paidAt: Date | null;
  paidAmountCents: number | null;
  createdAt: Date;
};

export type SeasonPassStatus = "pending_payment" | "active" | "cancelled";
export type SeasonPassView = {
  id: string;
  status: SeasonPassStatus;
  priceCents: number;
  includedLeads: number;
  installments: number;
  seasonStart: string;
  seasonEnd: string;
  activatedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Escrita (comandos que a fábrica de repositório expõe ao serviço)
// ---------------------------------------------------------------------------

export type PlanDraft = {
  freeLeads: number;
  freeLeadsValidityDays: number | null;
  season: { startMonth: number; endMonth: number };
  tiers: { minItems: number; maxItems: number | null; priceCents: number }[];
  packages: { amountCents: number }[];
  pass: PassConfig | null;
};

/** Repositório de cobrança (server-only, chamado com o `SessionActor` da sessão). */
export interface BillingStore {
  getActivePlan(): Promise<ActivePlan | null>;
  listPlanHistory(actor: SessionActor): Promise<ActivePlan[]>;
  publishPlan(actor: SessionActor, plan: PlanDraft): Promise<string>;

  getSummary(actor: SessionActor, stationeryId: string): Promise<WalletSummary>;
  /** Leitura passiva de terceiro (admin navegando papelarias): nunca cria a carteira. */
  getSummaryReadOnly(actor: SessionActor, stationeryId: string): Promise<WalletSummary>;
  listStatement(actor: SessionActor, stationeryId: string, limit?: number): Promise<LedgerEntryView[]>;
  listInvoices(actor: SessionActor, stationeryId: string): Promise<InvoiceView[]>;
  getInvoice(actor: SessionActor, stationeryId: string, invoiceId: string): Promise<InvoiceView | null>;
  listSeasonPasses(actor: SessionActor, stationeryId: string): Promise<SeasonPassView[]>;

  createPackageInvoice(
    actor: SessionActor,
    input: { stationeryId: string; packageId: string; provider: InvoiceProvider; idempotencyKey: string; termsVersion: string },
  ): Promise<string>;
  purchaseSeasonPass(
    actor: SessionActor,
    input: { stationeryId: string; installments: number; provider: InvoiceProvider; idempotencyKey: string; termsVersion: string },
  ): Promise<string>;
  /**
   * Compare-and-swap: só troca a cobrança MOSTRADA se `expectedCurrentChargeId` ainda bater com a atual (o valor que
   * o chamador leu antes de gerar a cobrança no PSP; `null` numa fatura nova). Sempre devolve a cobrança que está
   * de fato vinculada à fatura depois da chamada — a sua, se ganhou a corrida; a de quem ganhou, senão.
   */
  attachCharge(input: {
    invoiceId: string;
    provider: InvoiceProvider;
    expectedCurrentChargeId: string | null;
    providerChargeId: string;
    pixCopyPaste: string | null;
    chargeExpiresAt: Date | null;
  }): Promise<{ providerChargeId: string; pixCopyPaste: string | null; chargeExpiresAt: Date | null }>;
  confirmInvoicePayment(input: {
    invoiceId: string;
    provider: InvoiceProvider;
    providerRef: string;
    amountCents: number;
    paidAt: Date;
  }): Promise<boolean>;
  reverseEntry(input: { entryId: string; actorId: string | null; actorRole: "admin" | "system"; reason: string | null }): Promise<string>;

  /** Ficha da papelaria usada para escolher o `PaymentProvider` e montar o devedor Pix; `null` = não encontrada. */
  getStationeryBillingInfo(stationeryId: string): Promise<{ isDemo: boolean; cnpj: string; tradeName: string } | null>;
  /** Fatura Pix ABERTA com este `provider_charge_id` (webhook/cron; sem `SessionActor`, chamado pelo sistema). */
  findOpenInvoiceByChargeId(chargeId: string): Promise<{ invoiceId: string; amountCents: number } | null>;
  /** `provider_charge_id` de toda fatura Pix ainda aberta com cobrança anexada (cron diário de reconciliação). */
  listOpenPixChargeIds(limit: number): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// PaymentProvider (fake, demo, Pix)
// ---------------------------------------------------------------------------

export type ChargeInput = {
  invoiceId: string;
  amountCents: number;
  description: string;
  /** Só informativo para fake/demo; o Pix real ignora e usa sempre `PIX_CHARGE_TTL_SECONDS` do ambiente. */
  expiresInSeconds?: number;
  /** Devedor da cobrança Pix: dado da EMPRESA (papelaria), nunca CPF de membro nem dado do responsável. */
  payer: { cnpj: string; name: string };
};
export type Charge = { chargeId: string; copyPaste: string | null; expiresAt: Date };
export type ChargeStatus = { status: "pending" | "paid" | "expired" | "unknown"; paidAmountCents: number | null; paidAt: Date | null };

export type PaymentProviderId = "fake" | "demo" | "pix";
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  createCharge(input: ChargeInput): Promise<Charge>;
  getCharge(chargeId: string): Promise<ChargeStatus>;
}
