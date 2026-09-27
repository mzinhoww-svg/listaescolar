import "server-only";

import type { SessionActor } from "@/features/stationeries/actor";

import { ConversionError } from "./errors";
import type { AdminDisputeView, AuditRow, ConversionSignals, ConversionStore, DisputeView, LeadDisputeGate, ReviewView, SurveyLeadView } from "./ports";
import { confirmPurchaseInputSchema, disputeOpenInputSchema, disputeResolveInputSchema, reviewHideInputSchema, reviewInputSchema } from "./schemas";

export type ConversionServiceDeps = { store: ConversionStore };

/** Casos de uso de conversão/contestação (S22). Autorização final é do banco; aqui vão as regras de produto (Zod). */
export class ConversionService {
  constructor(private readonly deps: ConversionServiceDeps) {}

  async confirmPurchase(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = confirmPurchaseInputSchema.safeParse(raw);
    if (!parsed.success) throw new ConversionError("dados inválidos", "invalid_input");
    return this.deps.store.confirmPurchase(actor, parsed.data.leadId, parsed.data.answer);
  }

  async getSignals(actor: SessionActor, leadId: string): Promise<ConversionSignals> {
    return this.deps.store.getSignals(actor, leadId);
  }

  async createReview(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = reviewInputSchema.safeParse(raw);
    if (!parsed.success) throw new ConversionError("dados inválidos", "invalid_input");
    return this.deps.store.createReview(actor, parsed.data.leadId, { rating: parsed.data.rating, tags: parsed.data.tags, comment: parsed.data.comment });
  }

  async listPublishedReviews(stationeryId: string, limit = 20): Promise<ReviewView[]> {
    return this.deps.store.listPublishedReviews(stationeryId, limit);
  }

  async listRecentReviewsForAdmin(actor: SessionActor, limit = 50): Promise<ReviewView[]> {
    return this.deps.store.listRecentReviewsForAdmin(actor, limit);
  }

  async hideReview(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = reviewHideInputSchema.safeParse(raw);
    if (!parsed.success) throw new ConversionError("dados inválidos", "invalid_input");
    return this.deps.store.hideReview(actor, parsed.data.reviewId, parsed.data.reason);
  }

  async openDispute(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = disputeOpenInputSchema.safeParse(raw);
    if (!parsed.success) throw new ConversionError("dados inválidos", "invalid_input");
    return this.deps.store.openDispute(actor, parsed.data.leadId, parsed.data.reason, parsed.data.detail);
  }

  async resolveDispute(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = disputeResolveInputSchema.safeParse(raw);
    if (!parsed.success) throw new ConversionError("dados inválidos", "invalid_input");
    return this.deps.store.resolveDispute(actor, parsed.data.disputeId, parsed.data.decision, parsed.data.reason);
  }

  async getDisputeGate(actor: SessionActor, leadId: string): Promise<LeadDisputeGate> {
    return this.deps.store.getDisputeGate(actor, leadId);
  }

  async listDisputesForStationery(actor: SessionActor, stationeryId: string): Promise<DisputeView[]> {
    return this.deps.store.listDisputesForStationery(actor, stationeryId);
  }

  async listOpenDisputesForAdmin(actor: SessionActor): Promise<AdminDisputeView[]> {
    return this.deps.store.listOpenDisputesForAdmin(actor);
  }

  async listResolvedDisputesForAdmin(actor: SessionActor, limit = 20): Promise<AdminDisputeView[]> {
    return this.deps.store.listResolvedDisputesForAdmin(actor, limit);
  }

  async listSurveyLeadsForParent(actor: SessionActor, limit = 20): Promise<SurveyLeadView[]> {
    return this.deps.store.listSurveyLeadsForParent(actor, limit);
  }

  async listAuditRows(actor: SessionActor, limit = 50): Promise<AuditRow[]> {
    return this.deps.store.listAuditRows(actor, limit);
  }
}
