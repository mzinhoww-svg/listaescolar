import { formatBrl } from "@/features/billing/money";
import { resolvePaymentAlertAction } from "@/features/billing/admin-actions";
import type { PaymentAlertView } from "@/features/billing/ports";

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

/**
 * D-101 (conciliação, Admin13): pagamento recebido para uma fatura de papelaria que já não estava aberta (paga ou
 * cancelada) — o admin decide se precisa de estorno manual; o sistema nunca recredita sozinho.
 */
export function PaymentAlertsList({ alerts }: { alerts: readonly PaymentAlertView[] }) {
  const open = alerts.filter((a) => a.resolvedAt === null);
  return (
    <section aria-labelledby="alertas-titulo" className="rounded-card flex flex-col gap-3 bg-white p-6">
      <h2 id="alertas-titulo" className="text-[16px] font-extrabold">Alertas de pagamento tardio</h2>
      {open.length === 0 ? (
        <p className="text-texto-3 text-[14px] font-semibold">Nenhum alerta em aberto.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((a) => (
            <li key={a.id} className="bg-campo rounded-campo flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[14px] font-extrabold">
                  {formatBrl(a.amountCents)} recebidos numa fatura já {a.invoiceStatusAtDetection === "paid" ? "paga" : "cancelada"}
                </p>
                <p className="text-texto-3 text-[13px] font-semibold">
                  Fatura {a.invoiceId} · txid {a.providerChargeId} · detectado em {formatWhen(a.detectedAt)}
                </p>
              </div>
              <form action={resolvePaymentAlertAction} className="flex items-center gap-2">
                <input type="hidden" name="alertId" value={a.id} />
                <input
                  name="note"
                  placeholder="Nota (ex.: estornado manualmente)"
                  className="bg-white h-9 rounded-campo border border-linha px-3 text-[13px] font-semibold"
                />
                <button type="submit" className="bg-tinta text-papel rounded-botao h-9 px-4 text-[13px] font-extrabold">Resolver</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
