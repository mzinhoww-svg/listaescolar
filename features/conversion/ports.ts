import type { SessionActor } from "@/features/stationeries/actor";

export const PURCHASE_ANSWERS = ["bought_here", "not_yet", "bought_elsewhere"] as const;
export type PurchaseAnswer = (typeof PURCHASE_ANSWERS)[number];

export const DISPUTE_REASONS = ["wrong_number", "incomplete_list", "duplicate", "out_of_area"] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_DECISIONS = ["accepted", "rejected"] as const;
export type DisputeDecision = (typeof DISPUTE_DECISIONS)[number];

export type DisputeStatus = "open" | "accepted" | "rejected";

export const REVIEW_TAGS = ["entrega_rapida", "bom_atendimento", "preco_justo", "estoque_completo", "demorou_muito", "sem_estoque"] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];

export type ConversionSignals = {
  stationeryConfirmed: boolean;
  parentConfirmed: boolean;
  /** Sempre `false` nesta fatia: sem fonte de "Pix pela plataforma" antes da S23 (Ruling, ver ledger-comercio). */
  pixConfirmed: boolean;
  signalCount: number;
  /** Regra do PLAN: 2 de 3 sinais. */
  confirmed: boolean;
};

export type ReviewView = {
  id: string;
  leadId: string;
  stationeryId: string;
  rating: number;
  tags: string[];
  comment: string | null;
  status: "published" | "hidden";
  createdAt: Date;
};

export type DisputeView = {
  id: string;
  leadId: string;
  leadCode: string;
  stationeryId: string;
  reason: DisputeReason;
  detail: string | null;
  status: DisputeStatus;
  deadlineAt: Date;
  resolvedAt: Date | null;
  resolutionReason: string | null;
  reversedEntryId: string | null;
  createdAt: Date;
};

/** Lead do pai elegível para a pesquisa "Você comprou?" (App22) / avaliação (App23). */
export type SurveyLeadView = {
  leadId: string;
  code: string;
  stationeryId: string;
  stationeryName: string;
  schoolName: string;
  status: string;
  createdAt: Date;
  existingAnswer: PurchaseAnswer | null;
  canReview: boolean;
  alreadyReviewed: boolean;
};

/** Linha da auditoria de conversão do admin (Admin11): declarado (papelaria) x confirmado (regra 2 de 3). */
export type AuditRow = {
  leadId: string;
  code: string;
  stationeryId: string;
  stationeryName: string;
  createdAt: Date;
  signals: ConversionSignals;
  declaredConverted: boolean;
  divergent: boolean;
};

export type LeadDisputeGate = {
  leadId: string;
  stationeryId: string;
  deadlineAt: Date;
  canDispute: boolean;
  existingDispute: DisputeView | null;
};

export interface ConversionStore {
  confirmPurchase(actor: SessionActor, leadId: string, answer: PurchaseAnswer): Promise<string>;
  getSignals(actor: SessionActor, leadId: string): Promise<ConversionSignals>;
  createReview(actor: SessionActor, leadId: string, input: { rating: number; tags: ReviewTag[]; comment: string | null }): Promise<string>;
  listPublishedReviews(stationeryId: string, limit: number): Promise<ReviewView[]>;
  openDispute(actor: SessionActor, leadId: string, reason: DisputeReason, detail: string | null): Promise<string>;
  resolveDispute(actor: SessionActor, disputeId: string, decision: DisputeDecision, reason: string | null): Promise<string>;
  getDisputeGate(actor: SessionActor, leadId: string): Promise<LeadDisputeGate>;
  listDisputesForStationery(actor: SessionActor, stationeryId: string): Promise<DisputeView[]>;
  listOpenDisputesForAdmin(actor: SessionActor): Promise<DisputeView[]>;
  listResolvedDisputesForAdmin(actor: SessionActor, limit: number): Promise<DisputeView[]>;
  listSurveyLeadsForParent(actor: SessionActor, limit: number): Promise<SurveyLeadView[]>;
  listAuditRows(actor: SessionActor, limit: number): Promise<AuditRow[]>;
}
