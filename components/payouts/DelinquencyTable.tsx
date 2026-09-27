import { DELINQUENCY_STATUS_LABEL, type DelinquencyRow } from "@/features/payouts/ports";

const BADGE: Record<DelinquencyRow["status"], string> = {
  em_dia: "bg-verde-certo text-tinta",
  atraso: "bg-campo",
  pausado: "bg-tinta text-papel",
};

/**
 * Régua de cobrança por status (Admin14): calculada sempre a partir das faturas em aberto (S21) — nunca um saldo
 * em cache. "Pausado" já bloqueia leads novos automaticamente (billing_charge_lead_delivery, S23); esta fatia não
 * tem um botão manual de pausar/reativar (Ruling, ver ledger-comercio).
 */
export function DelinquencyTable({ rows }: { rows: readonly DelinquencyRow[] }) {
  const relevant = rows.filter((r) => r.status !== "em_dia");
  if (relevant.length === 0) {
    return <p className="text-texto-3 text-[14px] font-semibold">Nenhuma papelaria em atraso.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Papelaria</th>
            <th scope="col" className="px-5 py-4">Status</th>
            <th scope="col" className="px-5 py-4">Dias de atraso</th>
            <th scope="col" className="px-5 py-4">Fatura mais antiga em aberto</th>
          </tr>
        </thead>
        <tbody>
          {relevant.map((r) => (
            <tr key={r.stationeryId} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">{r.tradeName}</th>
              <td className="px-5 py-3.5">
                <span className={`rounded-botao px-3 py-1 text-[12px] font-extrabold ${BADGE[r.status]}`}>{DELINQUENCY_STATUS_LABEL[r.status]}</span>
              </td>
              <td className="px-5 py-3.5 font-bold">{r.daysOverdue}</td>
              <td className="px-5 py-3.5 font-bold">{r.oldestDueDate ?? "indisponível"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
