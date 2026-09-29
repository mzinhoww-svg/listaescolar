import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversionStore } from "./ports";
import { confirmPurchase, getSignals } from "./repository-shared";
import { createReview, hideReview, listPublishedReviews, listRecentReviewsForAdmin } from "./repository-reviews";
import {
  getDisputeGate,
  listDisputesForStationery,
  listOpenDisputesForAdmin,
  listResolvedDisputesForAdmin,
  openDispute,
  resolveDispute,
} from "./repository-disputes";
import { listAuditRows, listSurveyLeadsForParent } from "./repository-audit";

/**
 * D-158 (S19): este arquivo tinha 496 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do
 * D-057 (S18): `repository-shared.ts` (erro/guarda/sinais de conversão comuns), `repository-reviews.ts`
 * (avaliação, App23/Pap08), `repository-disputes.ts` (contestação, Pap03/Admin12), `repository-audit.ts`
 * (App22 + Admin11). Este arquivo continua sendo o ÚNICO ponto de import
 * (`@/features/conversion/repository`) — só `createConversionStore` é usado por fora deste diretório.
 */
export function createConversionStore(admin: SupabaseClient): ConversionStore {
  return {
    confirmPurchase: (actor, leadId, answer) => confirmPurchase(admin, actor, leadId, answer),
    getSignals: (actor, leadId) => getSignals(admin, actor, leadId),
    createReview: (actor, leadId, input) => createReview(admin, actor, leadId, input),
    listPublishedReviews: (stationeryId, limit) => listPublishedReviews(admin, stationeryId, limit),
    listRecentReviewsForAdmin: (actor, limit) => listRecentReviewsForAdmin(admin, actor, limit),
    hideReview: (actor, reviewId, reason) => hideReview(admin, actor, reviewId, reason),
    openDispute: (actor, leadId, reason, detail) => openDispute(admin, actor, leadId, reason, detail),
    resolveDispute: (actor, disputeId, decision, reason) => resolveDispute(admin, actor, disputeId, decision, reason),
    getDisputeGate: (actor, leadId) => getDisputeGate(admin, actor, leadId),
    listDisputesForStationery: (actor, stationeryId) => listDisputesForStationery(admin, actor, stationeryId),
    listOpenDisputesForAdmin: (actor) => listOpenDisputesForAdmin(admin, actor),
    listResolvedDisputesForAdmin: (actor, limit) => listResolvedDisputesForAdmin(admin, actor, limit),
    listSurveyLeadsForParent: (actor, limit) => listSurveyLeadsForParent(admin, actor, limit),
    listAuditRows: (actor, limit) => listAuditRows(admin, actor, limit),
  };
}
