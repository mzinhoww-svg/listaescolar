import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingStore } from "./ports";

/**
 * D-158 (S19): este arquivo tinha 603 linhas (guarda comum + plano + carteira + extrato/faturas/passes +
 * escritas de cobrança). Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do D-057 (S18):
 * `repository-shared.ts` (erro/guarda comuns), `repository-plans.ts`, `repository-wallet.ts`,
 * `repository-statement.ts`, `repository-charges.ts`. Este arquivo continua sendo o ÚNICO ponto de import
 * (`@/features/billing/repository`) — reexporta tudo dos irmãos e mantém só `createBillingStore`, que não
 * coube em nenhum grupo (compõe todos eles).
 */
export { dbErrorCode, fail, requireActor, requireAdmin, requireMemberOrAdmin } from "./repository-shared";
export { getActivePlan, listPlanHistory, publishPlan } from "./repository-plans";
export { getStationeryBillingInfo, getSummary, getSummaryReadOnly } from "./repository-wallet";
export { getInvoice, listInvoices, listSeasonPasses, listStatement } from "./repository-statement";
export {
  attachCharge,
  confirmInvoicePayment,
  createPackageInvoice,
  findAnyInvoiceByChargeId,
  findOpenInvoiceByChargeId,
  flagLatePayment,
  listOpenPixChargeIds,
  listPaymentAlerts,
  purchaseSeasonPass,
  resolvePaymentAlert,
  reverseEntry,
} from "./repository-charges";

import { getActivePlan, listPlanHistory, publishPlan } from "./repository-plans";
import { getStationeryBillingInfo, getSummary, getSummaryReadOnly } from "./repository-wallet";
import { getInvoice, listInvoices, listSeasonPasses, listStatement } from "./repository-statement";
import {
  attachCharge,
  confirmInvoicePayment,
  createPackageInvoice,
  findAnyInvoiceByChargeId,
  findOpenInvoiceByChargeId,
  flagLatePayment,
  listOpenPixChargeIds,
  listPaymentAlerts,
  purchaseSeasonPass,
  resolvePaymentAlert,
  reverseEntry,
} from "./repository-charges";

// ---------------------------------------------------------------------------
// Fábrica: agrupa as funções acima no formato `BillingStore` (ports.ts) para o serviço.
// ---------------------------------------------------------------------------

export function createBillingStore(admin: SupabaseClient): BillingStore {
  return {
    getActivePlan: () => getActivePlan(admin),
    listPlanHistory: (actor) => listPlanHistory(admin, actor),
    publishPlan: (actor, plan) => publishPlan(admin, actor, plan),
    getSummary: (actor, stationeryId) => getSummary(admin, actor, stationeryId),
    getSummaryReadOnly: (actor, stationeryId) => getSummaryReadOnly(admin, actor, stationeryId),
    listStatement: (actor, stationeryId, limit) => listStatement(admin, actor, stationeryId, limit),
    listInvoices: (actor, stationeryId) => listInvoices(admin, actor, stationeryId),
    getInvoice: (actor, stationeryId, invoiceId) => getInvoice(admin, actor, stationeryId, invoiceId),
    listSeasonPasses: (actor, stationeryId) => listSeasonPasses(admin, actor, stationeryId),
    createPackageInvoice: (actor, input) => createPackageInvoice(admin, actor, input),
    purchaseSeasonPass: (actor, input) => purchaseSeasonPass(admin, actor, input),
    attachCharge: (input) => attachCharge(admin, input),
    confirmInvoicePayment: (input) => confirmInvoicePayment(admin, input),
    reverseEntry: (input) => reverseEntry(admin, input),
    getStationeryBillingInfo: (stationeryId) => getStationeryBillingInfo(admin, stationeryId),
    findOpenInvoiceByChargeId: (chargeId) => findOpenInvoiceByChargeId(admin, chargeId),
    findAnyInvoiceByChargeId: (chargeId) => findAnyInvoiceByChargeId(admin, chargeId),
    flagLatePayment: (input) => flagLatePayment(admin, input),
    listOpenPixChargeIds: (limit) => listOpenPixChargeIds(admin, limit),
    listPaymentAlerts: (actor) => listPaymentAlerts(admin, actor),
    resolvePaymentAlert: (actor, input) => resolvePaymentAlert(admin, actor, input),
  };
}
