import { formatBrl } from "@/features/billing/money";
import type { SalePaymentView } from "@/features/payouts/ports";

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

/** Vendas confirmadas (Pix pela plataforma), com comissão e repasse já calculados (Admin13). */
export function SalesTable({ rows }: { rows: readonly SalePaymentView[] }) {
  if (rows.length === 0) {
    return <p className="text-texto-3 text-[14px] font-semibold">Nenhuma venda confirmada ainda.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white" tabIndex={0} role="region" aria-label="Tabela (role para o lado para ver todas as colunas)">
      <table className="w-full min-w-[900px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Pedido</th>
            <th scope="col" className="px-5 py-4">Papelaria</th>
            <th scope="col" className="px-5 py-4">Escola</th>
            <th scope="col" className="px-5 py-4">Valor</th>
            <th scope="col" className="px-5 py-4">Comissão</th>
            <th scope="col" className="px-5 py-4">Repasse</th>
            <th scope="col" className="px-5 py-4">Confirmada em</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">
                {r.leadCode}
                {r.isDemo ? <span className="bg-campo ml-2 rounded-botao px-2 py-0.5 text-[12px]">Demonstração</span> : null}
              </th>
              <td className="px-5 py-3.5 font-bold">{r.stationeryName}</td>
              <td className="px-5 py-3.5 font-bold">{r.schoolName ?? "não identificada"}</td>
              <td className="px-5 py-3.5 font-bold">{formatBrl(r.amountCents)}</td>
              <td className="px-5 py-3.5 font-bold">{formatBrl(r.commissionCents)}</td>
              <td className="px-5 py-3.5 font-bold">{r.repasseCents > 0 ? `${formatBrl(r.repasseCents)} (${r.repasseTarget === "apm" ? "APM" : "escola"})` : "—"}</td>
              <td className="px-5 py-3.5 font-bold whitespace-nowrap">{formatWhen(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
