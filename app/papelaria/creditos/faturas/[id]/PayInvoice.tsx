import { formatDateTime } from "@/components/stationeries/StatusPanel";
import { payInvoiceAction } from "@/features/billing/actions";
import type { InvoiceView } from "@/features/billing/ports";

/** Pagamento Pix da fatura aberta: BR Code copia-e-cola quando já gerado, ou botão para gerar (regenera se vencido). */
export function PayInvoice({ invoice, stationeryId, paymentAvailable, now }: { invoice: InvoiceView; stationeryId: string; paymentAvailable: boolean; now: Date }) {
  if (invoice.status !== "open" || invoice.provider !== "pix") return null;
  if (!paymentAvailable) {
    return <p className="text-texto-2 text-[14px] font-semibold">Pagamento via Pix indisponível no momento.</p>;
  }
  const expired = invoice.chargeExpiresAt !== null && invoice.chargeExpiresAt.getTime() <= now.getTime();
  if (invoice.pixCopyPaste && !expired) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-extrabold">Copie o código Pix (copia e cola)</p>
        <textarea readOnly value={invoice.pixCopyPaste} className="bg-campo rounded-campo w-full p-3 text-[13px]" rows={3} />
        {invoice.chargeExpiresAt ? <p className="text-texto-3 text-[12px] font-semibold">Válido até {formatDateTime(invoice.chargeExpiresAt)}</p> : null}
      </div>
    );
  }
  return (
    <form action={payInvoiceAction}>
      <input type="hidden" name="stationeryId" value={stationeryId} />
      <input type="hidden" name="invoiceId" value={invoice.id} />
      <button type="submit" className="bg-tinta text-papel h-12 rounded-botao px-6 text-[14px] font-extrabold">
        {expired ? "Gerar nova cobrança Pix" : "Gerar cobrança Pix"}
      </button>
    </form>
  );
}
