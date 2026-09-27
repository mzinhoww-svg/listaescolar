import { formatBrl } from "@/features/billing/money";
import { createPayoutBatchAction } from "@/features/payouts/actions";
import type { PendingRepasseView } from "@/features/payouts/ports";

/** Saldo pendente por escola/APM (Admin13): "Gerar lote de pagamento" cria a instrução; nada é transferido de verdade. */
export function PendingRepassesTable({ rows }: { rows: readonly PendingRepasseView[] }) {
  if (rows.length === 0) {
    return <p className="text-texto-3 text-[14px] font-semibold">Nada pendente de repasse agora.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Escola ou APM</th>
            <th scope="col" className="px-5 py-4">Valor pendente</th>
            <th scope="col" className="px-5 py-4"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.beneficiaryType}:${r.schoolId}`} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">
                {r.schoolName} {r.beneficiaryType === "apm" ? "· APM" : ""}
              </th>
              <td className="px-5 py-3.5 font-bold">{formatBrl(r.pendingCents)}</td>
              <td className="px-5 py-3.5">
                <form action={createPayoutBatchAction}>
                  <input type="hidden" name="schoolId" value={r.schoolId} />
                  <input type="hidden" name="beneficiaryType" value={r.beneficiaryType} />
                  <button type="submit" className="bg-tinta text-papel rounded-botao h-9 px-4 text-[13px] font-extrabold">
                    Gerar lote de pagamento
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
