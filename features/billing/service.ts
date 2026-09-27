import "server-only";

import type { SessionActor } from "@/features/stationeries/actor";

import { BillingError } from "./errors";
import { RECONCILE_BATCH_SIZE, RECONCILE_TIME_BUDGET_MS } from "./limits";
import type {
  ActivePlan,
  BillingStore,
  InvoiceView,
  LedgerEntryView,
  PaymentProvider,
  PlanDraft,
  SeasonPassView,
  WalletSummary,
} from "./ports";
import { buyPackageInputSchema, buyPassInputSchema, payInvoiceInputSchema, planDraftSchema, simulateDemoPaymentInputSchema } from "./schemas";
import { maxInstallmentsAvailable, seasonWindow } from "./season";
import { statementLines, weeklyAverage, type StatementLine } from "./statement";
import { BILLING_TERMS_TEXT_VERSION } from "./terms";
import { tierFor, validateTiers } from "./tiers";

export type BillingServiceDeps = {
  store: BillingStore;
  /** `resolvePaymentProvider` já parcialmente aplicado ao ambiente do processo (fábrica em `payments/factory.ts`). */
  providerFor: (wallet: { isDemo: boolean }) => PaymentProvider | null;
  now: () => Date;
};

export type PurchaseResult = { invoiceId: string; pixCopyPaste: string | null; chargeExpiresAt: Date | null; provider: PaymentProvider["id"] };

/** Casos de uso da cobrança da papelaria. Autorização final é do banco; aqui vão as regras de produto e o PSP. */
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

  private async resolveProviderOrThrow(stationeryId: string): Promise<{ provider: PaymentProvider; cnpj: string; tradeName: string }> {
    const info = await this.deps.store.getStationeryBillingInfo(stationeryId);
    if (!info) throw new BillingError("papelaria não encontrada", "not_found");
    const provider = this.deps.providerFor({ isDemo: info.isDemo });
    if (!provider) throw new BillingError("pagamento indisponível no momento", "payments_unavailable");
    return { provider, cnpj: info.cnpj, tradeName: info.tradeName };
  }

  /**
   * Gera (ou reaproveita) a cobrança Pix de uma fatura. D-100 (S23, revisão de segurança da S21): quando já existe
   * uma cobrança atual (`invoice.providerChargeId`), SEMPRE reconsulta o PSP antes de decidir — nunca gera uma
   * SEGUNDA cobrança por cima de uma ainda válida (duplo clique em "comprar pacote"/"comprar passe" reaproveitava a
   * FATURA pela idempotência, mas chamava esta função de novo, trocando uma cobrança Pix que o pagador podia já ter
   * em mãos por uma nova — os dois BR Codes ficavam pagáveis, risco de pagamento em dobro). Mesma lógica que
   * `payInvoice` já usava (extraída para cá, único lugar): `paid` com valor batendo confirma direto; `pending` com
   * `pixCopyPaste` ainda salvo devolve a cobrança atual tal como o PSP diz que vale; `unknown` nunca regenera às
   * cegas (falha visível); só sem cobrança nenhuma ou `expired` (já reconsultada) segue para gerar uma nova —
   * compare-and-swap (`attachCharge`) garante que o retorno é sempre a cobrança REALMENTE vinculada, mesmo com
   * corrida (revisão de segurança da S21).
   */
  private async attachPixChargeIfNeeded(
    provider: PaymentProvider,
    invoice: { id: string; amountCents: number; providerChargeId: string | null; pixCopyPaste: string | null; chargeExpiresAt: Date | null },
    description: string,
    payer: { cnpj: string; name: string },
  ): Promise<{ pixCopyPaste: string | null; chargeExpiresAt: Date | null }> {
    if (provider.id !== "pix") return { pixCopyPaste: null, chargeExpiresAt: null };
    if (invoice.providerChargeId) {
      const status = await provider.getCharge(invoice.providerChargeId);
      if (status.status === "paid" && status.paidAmountCents !== null) {
        if (status.paidAmountCents === invoice.amountCents) {
          await this.deps.store.confirmInvoicePayment({
            invoiceId: invoice.id,
            provider: provider.id,
            providerRef: invoice.providerChargeId,
            amountCents: status.paidAmountCents,
            paidAt: status.paidAt ?? this.deps.now(),
          });
        }
        return { pixCopyPaste: null, chargeExpiresAt: null };
      }
      if (status.status === "pending" && invoice.pixCopyPaste) {
        return { pixCopyPaste: invoice.pixCopyPaste, chargeExpiresAt: invoice.chargeExpiresAt };
      }
      if (status.status === "unknown") {
        throw new BillingError("não foi possível confirmar o status da cobrança no PSP", "payments_unavailable");
      }
      // 'expired' (já reconsultada, nada de dinheiro perdido) ou 'pending' sem copyPaste salvo: segue e gera nova.
    }
    const charge = await provider.createCharge({ invoiceId: invoice.id, amountCents: invoice.amountCents, description, payer });
    const attached = await this.deps.store.attachCharge({
      invoiceId: invoice.id,
      provider: provider.id,
      expectedCurrentChargeId: invoice.providerChargeId,
      providerChargeId: charge.chargeId,
      pixCopyPaste: charge.copyPaste,
      chargeExpiresAt: charge.expiresAt,
    });
    return { pixCopyPaste: attached.pixCopyPaste, chargeExpiresAt: attached.chargeExpiresAt };
  }

  /** Compra de pacote de crédito. Sem aceite -> `consent_required` sem chamar o repositório (nada é gravado). */
  async buyPackage(actor: SessionActor, raw: unknown): Promise<PurchaseResult> {
    const parsed = buyPackageInputSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("dados inválidos", "invalid_input");
    const input = parsed.data;
    // O checkbox precisa estar marcado NESTA compra (o banco reaproveitaria um consentimento antigo com `termsVersion`
    // vazio, mas isso é rede de segurança para retry idempotente, não uma forma de pular o aceite pela app).
    if (input.termsAccepted !== true) throw new BillingError("consentimento obrigatório", "consent_required");
    const { provider, cnpj, tradeName } = await this.resolveProviderOrThrow(input.stationeryId);
    const invoiceId = await this.deps.store.createPackageInvoice(actor, {
      stationeryId: input.stationeryId,
      packageId: input.packageId,
      provider: provider.id,
      idempotencyKey: input.idempotencyKey,
      termsVersion: BILLING_TERMS_TEXT_VERSION,
    });
    const invoice = await this.deps.store.getInvoice(actor, input.stationeryId, invoiceId);
    if (!invoice) throw new BillingError("fatura não encontrada", "not_found");
    const attached = await this.attachPixChargeIfNeeded(provider, invoice, "Recarga de créditos ListaCerta", { cnpj, name: tradeName });
    return { invoiceId, provider: provider.id, ...attached };
  }

  /** Compra/retoma o passe de temporada. */
  async buyPass(actor: SessionActor, raw: unknown): Promise<PurchaseResult & { installments: { installmentNo: number; amountCents: number }[] }> {
    const parsed = buyPassInputSchema.safeParse(raw);
    if (!parsed.success) throw new BillingError("dados inválidos", "invalid_input");
    const input = parsed.data;
    if (input.termsAccepted !== true) throw new BillingError("consentimento obrigatório", "consent_required");
    const { provider, cnpj, tradeName } = await this.resolveProviderOrThrow(input.stationeryId);
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
    const attached = await this.attachPixChargeIfNeeded(provider, first, "1ª parcela do passe de temporada ListaCerta", { cnpj, name: tradeName });
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
    const { provider, cnpj, tradeName } = await this.resolveProviderOrThrow(input.stationeryId);
    if (provider.id !== invoice.provider) throw new BillingError("provedor não bate com a fatura", "provider_invalid");
    return this.attachPixChargeIfNeeded(provider, invoice, "Fatura ListaCerta", { cnpj, name: tradeName });
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
    const info = await this.findInvoiceByChargeIdInternal(chargeId);
    if (!info) {
      await this.flagLateChargeIfActuallyPaid(chargeId);
      return null;
    }
    const provider = this.deps.providerFor({ isDemo: false });
    if (!provider || provider.id !== "pix") return null;
    const status = await provider.getCharge(chargeId);
    if (status.status !== "paid" || status.paidAmountCents === null) return { invoiceId: info.invoiceId, confirmed: false };
    if (status.paidAmountCents !== info.amountCents) return { invoiceId: info.invoiceId, confirmed: false };
    const confirmed = await this.deps.store.confirmInvoicePayment({
      invoiceId: info.invoiceId,
      provider: "pix",
      providerRef: chargeId,
      amountCents: status.paidAmountCents,
      paidAt: status.paidAt ?? this.deps.now(),
    });
    return { invoiceId: info.invoiceId, confirmed };
  }

  /**
   * D-101 (revisão de segurança da S21): o txid não bateu em nenhuma fatura ABERTA — pode ser um pagamento
   * recebido depois que a fatura já foi paga (ou cancelada) por outro caminho. Só registra o alerta se o PSP
   * CONFIRMAR que o valor foi mesmo pago (nunca pelo corpo do webhook); idempotente por (fatura, txid), então uma
   * redelivery do mesmo webhook não duplica o alerta. Nunca recredita: é só o registro para o admin decidir na
   * conciliação (Admin13).
   */
  private async flagLateChargeIfActuallyPaid(chargeId: string): Promise<void> {
    const any = await this.deps.store.findAnyInvoiceByChargeId(chargeId);
    if (!any || any.status === "open") return;
    const provider = this.deps.providerFor({ isDemo: false });
    if (!provider || provider.id !== "pix") return;
    const status = await provider.getCharge(chargeId);
    if (status.status !== "paid" || status.paidAmountCents === null) return;
    await this.deps.store.flagLatePayment({
      invoiceId: any.invoiceId,
      provider: "pix",
      providerChargeId: chargeId,
      amountCents: status.paidAmountCents,
    });
  }

  /** Só para uso interno do webhook/cron; contorna a checagem de posse (chamado sem `actor` de sessão). */
  private async findInvoiceByChargeIdInternal(chargeId: string): Promise<{ invoiceId: string; amountCents: number } | null> {
    return this.deps.store.findOpenInvoiceByChargeId(chargeId);
  }

  /**
   * Cron diário: reconsulta fatura Pix aberta com cobrança anexada. Revisão de segurança: lote limitado
   * (`RECONCILE_BATCH_SIZE`, as mais antigas primeiro) e orçamento de tempo (`RECONCILE_TIME_BUDGET_MS`) — estourou o
   * orçamento, para e devolve `truncated: true`; a próxima execução (diária) continua dali, sem cron sem fim.
   */
  async reconcileOpenInvoices(): Promise<{ checked: number; confirmed: number; truncated: boolean }> {
    const chargeIds = await this.deps.store.listOpenPixChargeIds(RECONCILE_BATCH_SIZE);
    const start = this.deps.now().getTime();
    let confirmed = 0;
    let checked = 0;
    let truncated = false;
    for (const chargeId of chargeIds) {
      if (this.deps.now().getTime() - start > RECONCILE_TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      checked++;
      try {
        const r = await this.reconcileInvoiceByChargeId(chargeId);
        if (r?.confirmed) confirmed++;
      } catch (error) {
        console.error("reconciliar fatura Pix", error instanceof Error ? error.name : "erro");
      }
    }
    return { checked, confirmed, truncated };
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
