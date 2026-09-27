import { simulateDemoPaymentAction } from "@/features/billing/actions";

/** "Simular pagamento (demonstração)": só aparece para fatura de carteira demo ainda aberta. */
export function DemoPayButton({ stationeryId, invoiceId }: { stationeryId: string; invoiceId: string }) {
  return (
    <form action={simulateDemoPaymentAction}>
      <input type="hidden" name="stationeryId" value={stationeryId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" className="bg-verde-certo text-tinta h-12 rounded-botao px-6 text-[14px] font-extrabold">
        Simular pagamento (demonstração)
      </button>
    </form>
  );
}
