import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoPayButton } from "@/components/billing/DemoPayButton";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { formatDateTime } from "@/components/stationeries/StatusPanel";
import { billingErrorMessage } from "@/features/billing/messages";
import { formatBrl } from "@/features/billing/money";
import { getBillingService } from "@/features/billing/wiring";
import { getOwnerContext } from "@/features/stationeries/session";

import { PayInvoice } from "./PayInvoice";

const STATUS_LABEL = { open: "Aberta", paid: "Paga", cancelled: "Cancelada" } as const;

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getOwnerContext(`/papelaria/creditos/faturas/${id}`);
  if (!ctx) {
    return (
      <>
        <PageHeader crumb="Papelaria" title="Fatura" />
        <Notice kind="info">Nenhuma papelaria vinculada a esta conta.</Notice>
      </>
    );
  }
  const billing = getBillingService();
  const invoice = await billing.getInvoice(ctx.actor, ctx.stationery.id, id);
  if (!invoice) notFound();

  const erro = billingErrorMessage(sp.erro);
  const paymentAvailable = billing.paymentAvailable(ctx.stationery.isDemo);

  return (
    <>
      <PageHeader crumb="Papelaria / Créditos / Fatura" title={invoice.kind === "credit_package" ? "Pacote de crédito" : `Passe de temporada · parcela ${invoice.installmentNo}`} />
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {sp.ok ? <Notice kind="ok">Pagamento confirmado.</Notice> : null}
      <div className="flex flex-col gap-4 rounded-card bg-white p-6">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-texto-3 text-[12px] font-extrabold uppercase">Valor</dt>
            <dd className="text-[20px] font-extrabold">{formatBrl(invoice.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-texto-3 text-[12px] font-extrabold uppercase">Status</dt>
            <dd className="text-[16px] font-extrabold">{STATUS_LABEL[invoice.status]}</dd>
          </div>
          <div>
            <dt className="text-texto-3 text-[12px] font-extrabold uppercase">Vencimento</dt>
            <dd className="text-[14px] font-bold">{invoice.dueDate}</dd>
          </div>
          {invoice.paidAt ? (
            <div>
              <dt className="text-texto-3 text-[12px] font-extrabold uppercase">Pago em</dt>
              <dd className="text-[14px] font-bold">{formatDateTime(invoice.paidAt)}</dd>
            </div>
          ) : null}
        </dl>
        {invoice.status === "open" && invoice.isDemo ? <DemoPayButton stationeryId={ctx.stationery.id} invoiceId={invoice.id} /> : null}
        {invoice.status === "open" && !invoice.isDemo ? (
          <PayInvoice invoice={invoice} stationeryId={ctx.stationery.id} paymentAvailable={paymentAvailable} now={new Date()} />
        ) : null}
        <p className="text-texto-3 text-[12px] font-semibold">Este recibo é da plataforma ListaCerta; nenhuma nota fiscal é emitida.</p>
      </div>
    </>
  );
}
