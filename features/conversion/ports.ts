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

/** Rótulo legível da etiqueta (revisão de segurança: nunca mostrar o slug cru na tela). */
export const REVIEW_TAG_LABEL: Record<ReviewTag, string> = {
  entrega_rapida: "Entrega rápida",
  bom_atendimento: "Bom atendimento",
  preco_justo: "Preço justo",
  estoque_completo: "Estoque completo",
  demorou_muito: "Demorou muito",
  sem_estoque: "Faltou item",
};

/** Motivo de OCULTAR avaliação (`lead_review_hide`, admin): sempre de uma lista fechada, nunca texto livre. */
export const REVIEW_HIDE_REASONS = ["personal_data", "offensive", "policy_violation", "other"] as const;
export type ReviewHideReason = (typeof REVIEW_HIDE_REASONS)[number];
export const REVIEW_HIDE_REASON_LABEL: Record<ReviewHideReason, string> = {
  personal_data: "Dado pessoal",
  offensive: "Conteúdo ofensivo",
  policy_violation: "Viola as regras",
  other: "Outro motivo",
};

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
  isDemo: boolean;
  hiddenReason: ReviewHideReason | null;
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
  /** Por que `canDispute` é `false` sem já haver uma disputa (revisão de segurança: espelha as regras da 0402). */
  blockedReason: "sold" | "expired" | "suspended" | null;
  /**
   * Revisão de segurança: o `detail` (texto livre da papelaria) vem `null` quando quem pediu é o SOLICITANTE do
   * lead — só a papelaria e o admin leem o próprio detalhe da contestação.
   */
  existingDispute: DisputeView | null;
};

/** Linha de contestação para o admin (Admin12): mostra o status do lead e os 3 sinais antes de "Aceitar"/"Rejeitar". */
export type AdminDisputeView = DisputeView & { leadStatus: string; signals: ConversionSignals };

export interface ConversionStore {
  confirmPurchase(actor: SessionActor, leadId: string, answer: PurchaseAnswer): Promise<string>;
  getSignals(actor: SessionActor, leadId: string): Promise<ConversionSignals>;
  createReview(actor: SessionActor, leadId: string, input: { rating: number; tags: ReviewTag[]; comment: string | null }): Promise<string>;
  listPublishedReviews(stationeryId: string, limit: number): Promise<ReviewView[]>;
  listRecentReviewsForAdmin(actor: SessionActor, limit: number): Promise<ReviewView[]>;
  hideReview(actor: SessionActor, reviewId: string, reason: ReviewHideReason): Promise<string>;
  openDispute(actor: SessionActor, leadId: string, reason: DisputeReason, detail: string | null): Promise<string>;
  resolveDispute(actor: SessionActor, disputeId: string, decision: DisputeDecision, reason: string | null): Promise<string>;
  getDisputeGate(actor: SessionActor, leadId: string): Promise<LeadDisputeGate>;
  listDisputesForStationery(actor: SessionActor, stationeryId: string): Promise<DisputeView[]>;
  listOpenDisputesForAdmin(actor: SessionActor): Promise<AdminDisputeView[]>;
  listResolvedDisputesForAdmin(actor: SessionActor, limit: number): Promise<AdminDisputeView[]>;
  listSurveyLeadsForParent(actor: SessionActor, limit: number): Promise<SurveyLeadView[]>;
  listAuditRows(actor: SessionActor, limit: number): Promise<AuditRow[]>;
}
