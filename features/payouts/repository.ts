import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PayoutStore } from "./ports";

/**
 * D-158 (S19): este arquivo tinha 533 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do
 * D-057 (S18): `repository-shared.ts` (erro/guarda comuns), `repository-settings.ts` (comissão + repasse de
 * escola), `repository-sales.ts` (confirmação de venda e filas), `repository-batches.ts` (lotes de repasse e
 * inadimplência), `repository-performance.ts` (Pap07). Este arquivo continua sendo o ÚNICO ponto de import
 * (`@/features/payouts/repository`) — reexporta tudo dos irmãos e mantém só `createPayoutStore`.
 */
export { dbErrorCode, fail, maskPixKey, requireActor, requireAdmin, requireStationeryAccess } from "./repository-shared";
export { getActiveSettings, listSchoolConfigs, listSchoolOptions, publishSchoolConfig, publishSettings } from "./repository-settings";
export {
  confirmSale,
  getSaleForLead,
  listConfirmableLeadsForStationery,
  listConfirmableSalesForAdmin,
  listRecentSalePayments,
} from "./repository-sales";
export { createBatch, listBatches, listDelinquency, listPendingRepasses, markBatchExecuted } from "./repository-batches";
export { getPerformanceSummary } from "./repository-performance";

import { getActiveSettings, listSchoolConfigs, listSchoolOptions, publishSchoolConfig, publishSettings } from "./repository-settings";
import {
  confirmSale,
  getSaleForLead,
  listConfirmableLeadsForStationery,
  listConfirmableSalesForAdmin,
  listRecentSalePayments,
} from "./repository-sales";
import { createBatch, listBatches, listDelinquency, listPendingRepasses, markBatchExecuted } from "./repository-batches";
import { getPerformanceSummary } from "./repository-performance";

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

export function createPayoutStore(admin: SupabaseClient): PayoutStore {
  return {
    getActiveSettings: () => getActiveSettings(admin),
    publishSettings: (actor, input) => publishSettings(admin, actor, input),
    listSchoolConfigs: (actor) => listSchoolConfigs(admin, actor),
    publishSchoolConfig: (actor, input) => publishSchoolConfig(admin, actor, input),
    confirmSale: (actor, input) => confirmSale(admin, actor, input),
    getSaleForLead: (actor, leadId) => getSaleForLead(admin, actor, leadId),
    listRecentSalePayments: (actor, limit) => listRecentSalePayments(admin, actor, limit),
    listConfirmableLeadsForStationery: (actor, stationeryId) => listConfirmableLeadsForStationery(admin, actor, stationeryId),
    listConfirmableSalesForAdmin: (actor) => listConfirmableSalesForAdmin(admin, actor),
    listPendingRepasses: (actor) => listPendingRepasses(admin, actor),
    listBatches: (actor, limit) => listBatches(admin, actor, limit),
    createBatch: (actor, input) => createBatch(admin, actor, input),
    markBatchExecuted: (actor, batchId) => markBatchExecuted(admin, actor, batchId),
    listDelinquency: (actor) => listDelinquency(admin, actor),
    listSchoolOptions: (actor) => listSchoolOptions(admin, actor),
    getPerformanceSummary: (actor, stationeryId) => getPerformanceSummary(admin, actor, stationeryId),
  };
}
