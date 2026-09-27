import "server-only";

import type { SessionActor } from "@/features/stationeries/actor";

import { PayoutError } from "./errors";
import type { DelinquencyRow, PayoutBatchView, PayoutSettingsView, PayoutStore, PendingRepasseView, PerformanceSummary, SalePaymentView, SchoolPayoutConfigView } from "./ports";
import { batchCreateInputSchema, batchMarkExecutedInputSchema, confirmSaleInputSchema, publishSchoolConfigInputSchema, publishSettingsInputSchema } from "./schemas";

export type PayoutServiceDeps = { store: PayoutStore };

/** Casos de uso de comissão/repasse/inadimplência (S23). Autorização final é do banco; aqui vão as regras de produto (Zod). */
export class PayoutService {
  constructor(private readonly deps: PayoutServiceDeps) {}

  async getActiveSettings(): Promise<PayoutSettingsView | null> {
    return this.deps.store.getActiveSettings();
  }

  async publishSettings(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = publishSettingsInputSchema.safeParse(raw);
    if (!parsed.success) throw new PayoutError("dados inválidos", "invalid_input");
    return this.deps.store.publishSettings(actor, parsed.data);
  }

  async listSchoolConfigs(actor: SessionActor): Promise<SchoolPayoutConfigView[]> {
    return this.deps.store.listSchoolConfigs(actor);
  }

  async publishSchoolConfig(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = publishSchoolConfigInputSchema.safeParse(raw);
    if (!parsed.success) throw new PayoutError("dados inválidos", "invalid_input");
    return this.deps.store.publishSchoolConfig(actor, parsed.data);
  }

  async listSchoolOptions(actor: SessionActor) {
    return this.deps.store.listSchoolOptions(actor);
  }

  async confirmSale(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = confirmSaleInputSchema.safeParse(raw);
    if (!parsed.success) throw new PayoutError("dados inválidos", "invalid_input");
    return this.deps.store.confirmSale(actor, parsed.data);
  }

  async listRecentSalePayments(actor: SessionActor, limit = 100): Promise<SalePaymentView[]> {
    return this.deps.store.listRecentSalePayments(actor, limit);
  }

  async getSaleForLead(actor: SessionActor, leadId: string): Promise<SalePaymentView | null> {
    return this.deps.store.getSaleForLead(actor, leadId);
  }

  async listConfirmableLeadsForStationery(actor: SessionActor, stationeryId: string) {
    return this.deps.store.listConfirmableLeadsForStationery(actor, stationeryId);
  }

  async listPendingRepasses(actor: SessionActor): Promise<PendingRepasseView[]> {
    return this.deps.store.listPendingRepasses(actor);
  }

  async listBatches(actor: SessionActor, limit = 50): Promise<PayoutBatchView[]> {
    return this.deps.store.listBatches(actor, limit);
  }

  async createBatch(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = batchCreateInputSchema.safeParse(raw);
    if (!parsed.success) throw new PayoutError("dados inválidos", "invalid_input");
    return this.deps.store.createBatch(actor, parsed.data);
  }

  async markBatchExecuted(actor: SessionActor, raw: unknown): Promise<string> {
    const parsed = batchMarkExecutedInputSchema.safeParse(raw);
    if (!parsed.success) throw new PayoutError("dados inválidos", "invalid_input");
    return this.deps.store.markBatchExecuted(actor, parsed.data.batchId);
  }

  async listDelinquency(actor: SessionActor): Promise<DelinquencyRow[]> {
    return this.deps.store.listDelinquency(actor);
  }

  async getPerformanceSummary(actor: SessionActor, stationeryId: string): Promise<PerformanceSummary> {
    return this.deps.store.getPerformanceSummary(actor, stationeryId);
  }
}
