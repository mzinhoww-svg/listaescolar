import "server-only";

import type { SessionActor } from "@/features/stationeries/actor";

import { BillingError } from "./errors";
import type { ActivePlan, InvoiceView, LedgerEntryView, PlanDraft, SeasonPassView, WalletSummary } from "./ports";
import { buyPackageInputSchema, buyPassInputSchema, payInvoiceInputSchema, planDraftSchema, simulateDemoPaymentInputSchema } from "./schemas";
import { maxInstallmentsAvailable, seasonWindow } from "./season";
import { attachPixChargeIfNeeded, reconcileInvoiceByChargeId, reconcileOpenInvoices, resolveProviderOrThrow } from "./service-pix";
import type { BillingServiceDeps, PurchaseResult } from "./service-types";
import { statementLines, weeklyAverage, type StatementLine } from "./statement";
import { BILLING_TERMS_TEXT_VERSION } from "./terms";
import { tierFor, validateTiers } from "./tiers";

export type { BillingServiceDeps, PurchaseResult } from "./service-types";

/**
 * D-158 (S19): este arquivo tinha 334 linhas. A cobrança Pix (gerar/reaproveitar cobrança) e a reconciliação
 * foram extraídas para `service-pix.ts` (funções que só dependem de `BillingServiceDeps`, ver nota lá); os
 * métodos públicos abaixo continuam com a MESMA assinatura, agora como delegadores de uma linha — nenhum
 * comportamento muda, nenhum chamador externo é afetado.
 *
 * Casos de uso da cobrança da papelaria. Autorização final é do banco; aqui vão as regras de produto e o PSP.
 */
export class BillingService {
  constructor(private readonly deps: BillingServiceDeps) {}

  async getActivePlan(): Promise<ActivePlan | null> {
    return this.deps.store.getActivePlan();
  }

  async listPlanHistory(actor: SessionActor): Promise<ActivePlan[]> {
    return this.deps.store.listPlanHistory(actor);
  }

  /** `maxInstallmentsAvailable` do plano ativo, para o seletor de parcelas do Pap06. `null` sem passe ou sem plano. */
  async maxInstallmentsForPass(): Promise<number | null> {
    const plan = await this.getActivePlan();
    if (!plan?.pass) return null;
    return maxInstallmentsAvailable({ seasonStartMonth: plan.seasonStartMonth, seasonEndMonth: plan.seasonEndMonth, passMaxInstallments: plan.pass.maxInstallments }, this.deps.now());
  }

  async getSummary(actor: SessionActor, stationeryId: string): Promise<WalletSummary> {
    return this.deps.store.getSummary(actor, stationeryId);
  }

  /** Leitura passiva de terceiro (o "Cobrança" de /admin/papelarias/[id]): nunca cria a carteira. */
  async getSummaryReadOnly(actor: SessionActor, stationeryId: string): Promise<WalletSummary> {
    return this.deps.store.getSummaryReadOnly(actor, stationeryId);
  }

  async getStatement(actor: SessionActor, stationeryId: string): Promise<{ lines: StatementLine[]; weeklyAverage: number | null; raw: LedgerEntryView[] }> {
    const entries = await this.deps.store.listStatement(actor, stationeryId);
    return { lines: statementLines(entries), weeklyAverage: weeklyAverage(entries, this.deps.now()), raw: entries };
  }

  async listInvoices(actor: SessionActor, stationeryId: string): Promise<InvoiceView[]> {
    return this.deps.store.listInvoices(actor, stationeryId);
  }

  async getInvoice(actor: SessionActor, stationeryId: string, invoiceId: string): Promise<InvoiceView | null> {
    return this.deps.store.getInvoice(actor, stationeryId, invoiceId);
  }

  async listSeasonPasses(actor: SessionActor, stationeryId: string): Promise<SeasonPassView[]> {
    return this.deps.store.listSeasonPasses(actor, stationeryId);
  }

  /** Publica um novo plano (admin). Faixas validadas de novo aqui (TS × SQL); o banco é a fonte final. */
  async publishPlan(actor: SessionActor, raw: unknown): Promise<string> {
    if (actor.role !== "admin") throw new BillingError("só a equipe administra planos", "forbidden");
    const parsed = planDraftSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("plano com campos inválidos", "invalid_plan");
    const draft = parsed.data;
    const tiersCheck = validateTiers(draft.tiers);
    if (!tiersCheck.ok) throw new BillingError(`faixas de preço inválidas (${tiersCheck.reason})`, "invalid_plan");
    const planDraft: PlanDraft = draft;
    return this.deps.store.publishPlan(actor, planDraft);
  }

  /** Se há um `PaymentProvider` disponível para este tipo de carteira (Pap06: "Pagamento via Pix indisponível"). */
  paymentAvailable(isDemo: boolean): boolean {
    return this.deps.providerFor({ isDemo }) !== null;
  }

  /** Compra de pacote de crédito. Sem aceite -> `consent_required` sem chamar o repositório (nada é gravado). */
  async buyPackage(actor: SessionActor, raw: unknown): Promise<PurchaseResult> {
    const parsed = buyPackageInputSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("dados inválidos", "invalid_input");
    const input = parsed.data;
    // O checkbox precisa estar marcado NESTA compra (o banco reaproveitaria um consentimento antigo com `termsVersion`
    // vazio, mas isso é rede de segurança para retry idempotente, não uma forma de pular o aceite pela app).
    if (input.termsAccepted !== true) throw new BillingError("consentimento obrigatório", "consent_required");
    const { provider, cnpj, tradeName } = await resolveProviderOrThrow(this.deps, input.stationeryId);
    const invoiceId = await this.deps.store.createPackageInvoice(actor, {
      stationeryId: input.stationeryId,
      packageId: input.packageId,
      provider: provider.id,
      idempotencyKey: input.idempotencyKey,
      termsVersion: BILLING_TERMS_TEXT_VERSION,
    });
    const invoice = await this.deps.store.getInvoice(actor, input.stationeryId, invoiceId);
    if (!invoice) throw new BillingError("fatura não encontrada", "not_found");
    const attached = await attachPixChargeIfNeeded(this.deps, provider, invoice, "Recarga de créditos ListaCerta", { cnpj, name: tradeName });
    return { invoiceId, provider: provider.id, ...attached };
  }

  /** Compra/retoma o passe de temporada. */
  async buyPass(actor: SessionActor, raw: unknown): Promise<PurchaseResult & { installments: { installmentNo: number; amountCents: number }[] }> {
    const parsed = buyPassInputSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("dados inválidos", "invalid_input");
    const input = parsed.data;
    if (input.termsAccepted !== true) throw new BillingError("consentimento obrigatório", "consent_required");
    const { provider, cnpj, tradeName } = await resolveProviderOrThrow(this.deps, input.stationeryId);
    const passId = await this.deps.store.purchaseSeasonPass(actor, {
      stationeryId: input.stationeryId,
      installments: input.installments,
      provider: provider.id,
      idempotencyKey: input.idempotencyKey,
      termsVersion: BILLING_TERMS_TEXT_VERSION,
    });
    const invoices = await this.deps.store.listInvoices(actor, input.stationeryId);
    const passInvoices = invoices.filter((i) => i.kind === "season_pass_installment" && i.seasonPassId === passId).sort((a, b) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
    const first = passInvoices.find((i) => i.installmentNo === 1);
    if (!first) throw new BillingError("1ª parcela não encontrada", "database");
    const attached = await attachPixChargeIfNeeded(this.deps, provider, first, "1ª parcela do passe de temporada ListaCerta", { cnpj, name: tradeName });
    return {
      invoiceId: first.id,
      provider: provider.id,
      installments: passInvoices.map((i) => ({ installmentNo: i.installmentNo ?? 0, amountCents: i.amountCents })),
      ...attached,
    };
  }

  /**
   * "Pagar com Pix" numa fatura já existente. Delega a `attachPixChargeIfNeeded` (D-100/S21: reconsulta o PSP antes
   * de decidir gerar ou reaproveitar a cobrança atual — nunca regenera às cegas nem perde um pagamento feito no
   * meio-tempo).
   */
  async payInvoice(actor: SessionActor, raw: unknown): Promise<{ pixCopyPaste: string | null; chargeExpiresAt: Date | null }> {
    const parsed = payInvoiceInputSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("dados inválidos", "invalid_input");
    const input = parsed.data;
    const invoice = await this.deps.store.getInvoice(actor, input.stationeryId, input.invoiceId);
    if (!invoice) throw new BillingError("fatura não encontrada", "not_found");
    if (invoice.status !== "open") throw new BillingError("fatura não está aberta", "invalid_state");
    const { provider, cnpj, tradeName } = await resolveProviderOrThrow(this.deps, input.stationeryId);
    if (provider.id !== invoice.provider) throw new BillingError("provedor não bate com a fatura", "provider_invalid");
    return attachPixChargeIfNeeded(this.deps, provider, invoice, "Fatura ListaCerta", { cnpj, name: tradeName });
  }

  /** "Simular pagamento (demonstração)": confirma direto, sem depender de status de PSP (não há PSP real na demo). */
  async simulateDemoPayment(actor: SessionActor, raw: unknown): Promise<boolean> {
    const parsed = simulateDemoPaymentInputSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("dados inválidos", "invalid_input");
    const input = parsed.data;
    const info = await this.deps.store.getStationeryBillingInfo(input.stationeryId);
    if (!info) throw new BillingError("papelaria não encontrada", "not_found");
    if (!info.isDemo) throw new BillingError("simulação só vale para carteira de demonstração", "provider_invalid");
    const provider = this.deps.providerFor({ isDemo: true });
    if (!provider || provider.id !== "demo") throw new BillingError("demonstração indisponível neste ambiente", "payments_unavailable");
    const invoice = await this.deps.store.getInvoice(actor, input.stationeryId, input.invoiceId);
    if (!invoice) throw new BillingError("fatura não encontrada", "not_found");
    if (invoice.status !== "open") return false;
    return this.deps.store.confirmInvoicePayment({ invoiceId: invoice.id, provider: "demo", providerRef: `demo:${invoice.id}`, amountCents: invoice.amountCents, paidAt: this.deps.now() });
  }

  /** Reconsulta o PSP e SÓ confirma com `CONCLUIDA` e valor igual (nunca pelo corpo do webhook nem do cron). */
  async reconcileInvoiceByChargeId(chargeId: string): Promise<{ invoiceId: string; confirmed: boolean } | null> {
    return reconcileInvoiceByChargeId(this.deps, chargeId);
  }

  /**
   * Cron diário: reconsulta fatura Pix aberta com cobrança anexada. Revisão de segurança: lote limitado e
   * orçamento de tempo (ver `service-pix.ts`) — estourou o orçamento, para e devolve `truncated: true`.
   */
  async reconcileOpenInvoices(): Promise<{ checked: number; confirmed: number; truncated: boolean }> {
    return reconcileOpenInvoices(this.deps);
  }

  /** Estorno (usado pela S22, contestação aceita). */
  async reverseEntry(input: { entryId: string; actorId: string | null; actorRole: "admin" | "system"; reason: string | null }): Promise<string> {
    return this.deps.store.reverseEntry(input);
  }

  /** D-101 (S23): fila de alertas de pagamento tardio para a conciliação do Admin13. */
  async listPaymentAlerts(actor: SessionActor) {
    return this.deps.store.listPaymentAlerts(actor);
  }

  async resolvePaymentAlert(actor: SessionActor, input: { alertId: string; note: string | null }): Promise<string> {
    return this.deps.store.resolvePaymentAlert(actor, input);
  }

  tierForItemCount(plan: ActivePlan, itemCount: number) {
    return tierFor(plan.tiers, itemCount);
  }

  seasonWindowFor(plan: ActivePlan) {
    return seasonWindow({ seasonStartMonth: plan.seasonStartMonth, seasonEndMonth: plan.seasonEndMonth }, this.deps.now());
  }
}
