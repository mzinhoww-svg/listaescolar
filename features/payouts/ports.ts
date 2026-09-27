import type { SessionActor } from "@/features/stationeries/actor";

export const PAYOUT_TARGETS = ["none", "school", "apm"] as const;
export type PayoutTarget = (typeof PAYOUT_TARGETS)[number];

export const PIX_KEY_KINDS = ["cpf", "cnpj", "email", "phone", "random"] as const;
export type PixKeyKind = (typeof PIX_KEY_KINDS)[number];
export const PIX_KEY_KIND_LABEL: Record<PixKeyKind, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Chave aleatória",
};

export const DELINQUENCY_STATUSES = ["em_dia", "atraso", "pausado"] as const;
export type DelinquencyStatus = (typeof DELINQUENCY_STATUSES)[number];
export const DELINQUENCY_STATUS_LABEL: Record<DelinquencyStatus, string> = {
  em_dia: "Em dia",
  atraso: "Em atraso",
  pausado: "Pausado (sem leads novos)",
};

export type PayoutSettingsView = {
  id: string;
  commissionBps: number;
  graceDays: number;
  blockDays: number;
  createdAt: Date;
};

/** Config de repasse de uma escola/APM (Admin13); `pixKeyMasked` nunca expõe a chave inteira, só os 4 finais. */
export type SchoolPayoutConfigView = {
  id: string;
  schoolId: string;
  schoolName: string;
  target: PayoutTarget;
  payoutBps: number;
  beneficiaryName: string | null;
  pixKeyKind: PixKeyKind | null;
  pixKeyMasked: string | null;
  createdAt: Date;
};

export type SalePaymentView = {
  id: string;
  leadId: string;
  leadCode: string;
  stationeryId: string;
  stationeryName: string;
  schoolId: string | null;
  schoolName: string | null;
  amountCents: number;
  commissionCents: number;
  repasseCents: number;
  repasseTarget: PayoutTarget | null;
  isDemo: boolean;
  createdAt: Date;
};

export type PendingRepasseView = {
  beneficiaryType: "school" | "apm";
  schoolId: string;
  schoolName: string;
  pendingCents: number;
};

export type PayoutBatchView = {
  id: string;
  beneficiaryType: "school" | "apm";
  schoolId: string;
  schoolName: string;
  totalCents: number;
  status: "pending" | "executed";
  createdAt: Date;
  executedAt: Date | null;
};

export type DelinquencyRow = {
  stationeryId: string;
  tradeName: string;
  status: DelinquencyStatus;
  daysOverdue: number;
  oldestDueDate: string | null;
};

/**
 * Pap07 (desempenho da papelaria): funil de status, ticket médio (só vendas confirmadas por Pix pela plataforma —
 * sem fonte para o valor de vendas fora dela) e declarado × confirmado (regra 2 de 3, S22). Sem "respondido em até
 * 1h" nem comparação de bairro nesta fatia (dívida registrada, ver ledger-comercio — dados/])k-anonimato exigiriam
 * mais tempo do que esta fatia comporta).
 */
export type PerformanceSummary = {
  funnel: { sent: number; opened: number; attended: number; sold: number };
  ticketAverageCents: number | null;
  declaredCount: number;
  confirmedCount: number;
};

export interface PayoutStore {
  getActiveSettings(): Promise<PayoutSettingsView | null>;
  publishSettings(actor: SessionActor, input: { commissionBps: number; graceDays: number; blockDays: number }): Promise<string>;

  listSchoolConfigs(actor: SessionActor): Promise<SchoolPayoutConfigView[]>;
  publishSchoolConfig(
    actor: SessionActor,
    input: { schoolId: string; target: PayoutTarget; payoutBps: number; beneficiaryName: string | null; pixKey: string | null; pixKeyKind: PixKeyKind | null },
  ): Promise<string>;

  confirmSale(actor: SessionActor, input: { leadId: string; schoolId: string | null }): Promise<string>;
  /** `null` = ainda não confirmada; usado pelo Pap03 para mostrar (ou não) o botão "Confirmar Pix pela plataforma". */
  getSaleForLead(actor: SessionActor, leadId: string): Promise<SalePaymentView | null>;
  listRecentSalePayments(actor: SessionActor, limit: number): Promise<SalePaymentView[]>;
  /** Leads convertidos com valor declarado, ainda sem `sale_payments` — candidatos a confirmar (Admin13/Pap03). */
  listConfirmableLeadsForStationery(actor: SessionActor, stationeryId: string): Promise<{ leadId: string; leadCode: string; amountCents: number; schoolNameHint: string }[]>;

  listPendingRepasses(actor: SessionActor): Promise<PendingRepasseView[]>;
  listBatches(actor: SessionActor, limit: number): Promise<PayoutBatchView[]>;
  createBatch(actor: SessionActor, input: { schoolId: string; beneficiaryType: "school" | "apm" }): Promise<string>;
  markBatchExecuted(actor: SessionActor, batchId: string): Promise<string>;

  listDelinquency(actor: SessionActor): Promise<DelinquencyRow[]>;

  /** Pap07: só o dono/staff da própria papelaria (ou admin). */
  getPerformanceSummary(actor: SessionActor, stationeryId: string): Promise<PerformanceSummary>;

  /** Escolas conhecidas (para o formulário de config por escola); sem paginação nesta fatia (piloto de 1 cidade). */
  listSchoolOptions(actor: SessionActor): Promise<{ id: string; name: string }[]>;
}
