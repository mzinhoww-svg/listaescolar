import "server-only";

import { BillingError } from "./errors";
import { RECONCILE_BATCH_SIZE, RECONCILE_TIME_BUDGET_MS } from "./limits";
import type { PaymentProvider } from "./ports";
import type { BillingServiceDeps } from "./service-types";

/**
 * D-158 (S19): extraído de `service.ts` (334 linhas) — cobrança Pix (gerar/reaproveitar) e reconciliação. Estas
 * funções só dependem de `BillingServiceDeps` (nunca de outro estado do `BillingService`), então virou uma
 * extração de função pura, com o mesmo `deps` explícito, em vez do padrão de closure usado noutros módulos —
 * `service.ts` mantém os métodos públicos como delegadores de uma linha (`return fn(this.deps, ...)`), nenhum
 * comportamento muda.
 */

export async function resolveProviderOrThrow(deps: BillingServiceDeps, stationeryId: string): Promise<{ provider: PaymentProvider; cnpj: string; tradeName: string }> {
  const info = await deps.store.getStationeryBillingInfo(stationeryId);
  if (!info) throw new BillingError("papelaria não encontrada", "not_found");
  const provider = deps.providerFor({ isDemo: info.isDemo });
  if (!provider) throw new BillingError("pagamento indisponível no momento", "payments_unavailable");
  return { provider, cnpj: info.cnpj, tradeName: info.tradeName };
}

/**
 * Gera (ou reaproveita) a cobrança Pix de uma fatura. D-100 (S23, revisão de segurança da S21): quando já existe
 * uma cobrança atual (`invoice.providerChargeId`), SEMPRE reconsulta o PSP antes de decidir — nunca gera uma
 * SEGUNDA cobrança por cima de uma ainda válida (duplo clique em "comprar pacote"/"comprar passe" reaproveitava a
 * FATURA pela idempotência, mas chamava esta função de novo, trocando uma cobrança Pix que o pagador podia já ter
 * em mãos por uma nova — os dois BR Codes ficavam pagáveis, risco de pagamento em dobro). `paid` com valor batendo
 * confirma direto; `pending` com `pixCopyPaste` ainda salvo devolve a cobrança atual tal como o PSP diz que vale;
 * `unknown` nunca regenera às cegas (falha visível); só sem cobrança nenhuma ou `expired` (já reconsultada) segue
 * para gerar uma nova — compare-and-swap (`attachCharge`) garante que o retorno é sempre a cobrança REALMENTE
 * vinculada, mesmo com corrida (revisão de segurança da S21).
 */
export async function attachPixChargeIfNeeded(
  deps: BillingServiceDeps,
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
        await deps.store.confirmInvoicePayment({
          invoiceId: invoice.id,
          provider: provider.id,
          providerRef: invoice.providerChargeId,
          amountCents: status.paidAmountCents,
          paidAt: status.paidAt ?? deps.now(),
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
  const attached = await deps.store.attachCharge({
    invoiceId: invoice.id,
    provider: provider.id,
    expectedCurrentChargeId: invoice.providerChargeId,
    providerChargeId: charge.chargeId,
    pixCopyPaste: charge.copyPaste,
    chargeExpiresAt: charge.expiresAt,
  });
  return { pixCopyPaste: attached.pixCopyPaste, chargeExpiresAt: attached.chargeExpiresAt };
}

/** Só para uso interno do webhook/cron; contorna a checagem de posse (chamado sem `actor` de sessão). */
async function findInvoiceByChargeIdInternal(deps: BillingServiceDeps, chargeId: string): Promise<{ invoiceId: string; amountCents: number } | null> {
  return deps.store.findOpenInvoiceByChargeId(chargeId);
}

/**
 * D-101 (revisão de segurança da S21): o txid não bateu em nenhuma fatura ABERTA — pode ser um pagamento
 * recebido depois que a fatura já foi paga (ou cancelada) por outro caminho. Só registra o alerta se o PSP
 * CONFIRMAR que o valor foi mesmo pago (nunca pelo corpo do webhook); idempotente por (fatura, txid), então uma
 * redelivery do mesmo webhook não duplica o alerta. Nunca recredita: é só o registro para o admin decidir na
 * conciliação (Admin13).
 */
async function flagLateChargeIfActuallyPaid(deps: BillingServiceDeps, chargeId: string): Promise<void> {
  const any = await deps.store.findAnyInvoiceByChargeId(chargeId);
  if (!any || any.status === "open") return;
  const provider = deps.providerFor({ isDemo: false });
  if (!provider || provider.id !== "pix") return;
  const status = await provider.getCharge(chargeId);
  if (status.status !== "paid" || status.paidAmountCents === null) return;
  await deps.store.flagLatePayment({
    invoiceId: any.invoiceId,
    provider: "pix",
    providerChargeId: chargeId,
    amountCents: status.paidAmountCents,
  });
}

/** Reconsulta o PSP e SÓ confirma com `CONCLUIDA` e valor igual (nunca pelo corpo do webhook nem do cron). */
export async function reconcileInvoiceByChargeId(deps: BillingServiceDeps, chargeId: string): Promise<{ invoiceId: string; confirmed: boolean } | null> {
  const info = await findInvoiceByChargeIdInternal(deps, chargeId);
  if (!info) {
    await flagLateChargeIfActuallyPaid(deps, chargeId);
    return null;
  }
  const provider = deps.providerFor({ isDemo: false });
  if (!provider || provider.id !== "pix") return null;
  const status = await provider.getCharge(chargeId);
  if (status.status !== "paid" || status.paidAmountCents === null) return { invoiceId: info.invoiceId, confirmed: false };
  if (status.paidAmountCents !== info.amountCents) return { invoiceId: info.invoiceId, confirmed: false };
  const confirmed = await deps.store.confirmInvoicePayment({
    invoiceId: info.invoiceId,
    provider: "pix",
    providerRef: chargeId,
    amountCents: status.paidAmountCents,
    paidAt: status.paidAt ?? deps.now(),
  });
  return { invoiceId: info.invoiceId, confirmed };
}

/**
 * Cron diário: reconsulta fatura Pix aberta com cobrança anexada. Revisão de segurança: lote limitado
 * (`RECONCILE_BATCH_SIZE`, as mais antigas primeiro) e orçamento de tempo (`RECONCILE_TIME_BUDGET_MS`) — estourou o
 * orçamento, para e devolve `truncated: true`; a próxima execução (diária) continua dali, sem cron sem fim.
 */
export async function reconcileOpenInvoices(deps: BillingServiceDeps): Promise<{ checked: number; confirmed: number; truncated: boolean }> {
  const chargeIds = await deps.store.listOpenPixChargeIds(RECONCILE_BATCH_SIZE);
  const start = deps.now().getTime();
  let confirmed = 0;
  let checked = 0;
  let truncated = false;
  for (const chargeId of chargeIds) {
    if (deps.now().getTime() - start > RECONCILE_TIME_BUDGET_MS) {
      truncated = true;
      break;
    }
    checked++;
    try {
      const r = await reconcileInvoiceByChargeId(deps, chargeId);
      if (r?.confirmed) confirmed++;
    } catch (error) {
      console.error("reconciliar fatura Pix", error instanceof Error ? error.name : "erro");
    }
  }
  return { checked, confirmed, truncated };
}
