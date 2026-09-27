import { formatBrl } from "@/features/billing/money";
import { markPayoutBatchExecutedAction } from "@/features/payouts/actions";
import type { PayoutBatchView } from "@/features/payouts/ports";

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

/**
 * Lotes de pagamento (Admin13): o sistema já gerou a instrução (quem, quanto); "Marcar como executado" só REGISTRA
 * que o admin já fez a transferência de verdade FORA do sistema — nenhum dinheiro se move por aqui.
 */
export function BatchesTable({ rows }: { rows: readonly PayoutBatchView[] }) {
  if (rows.length === 0) {
    return <p className="text-texto-3 text-[14px] font-semibold">Nenhum lote gerado ainda.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Escola ou APM</th>
            <th scope="col" className="px-5 py-4">Valor</th>
            <th scope="col" className="px-5 py-4">Gerado em</th>
            <th scope="col" className="px-5 py-4">Status</th>
            <th scope="col" className="px-5 py-4"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">{r.schoolName} {r.beneficiaryType === "apm" ? "· APM" : ""}</th>
              <td className="px-5 py-3.5 font-bold">{formatBrl(r.totalCents)}</td>
              <td className="px-5 py-3.5 font-bold whitespace-nowrap">{formatWhen(r.createdAt)}</td>
              <td className="px-5 py-3.5">
                <span className={`rounded-botao px-3 py-1 text-[12px] font-extrabold ${r.status === "executed" ? "bg-verde-certo text-tinta" : "bg-campo"}`}>
                  {r.status === "executed" ? "Pago" : "Pendente"}
                </span>
              </td>
              <td className="px-5 py-3.5">
                {r.status === "pending" ? (
                  <form action={markPayoutBatchExecutedAction}>
                    <input type="hidden" name="batchId" value={r.id} />
                    <button type="submit" className="border-tinta text-tinta rounded-botao h-9 border-[1.5px] px-4 text-[13px] font-extrabold">
                      Marcar como executado
                    </button>
                  </form>
                ) : (
                  <span className="text-texto-3 text-[13px] font-semibold">executado em {r.executedAt ? formatWhen(r.executedAt) : "indisponível"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
