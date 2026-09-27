import { formatDateTime } from "@/components/stationeries/StatusPanel";
import { formatBrl } from "@/features/billing/money";
import type { StatementLine } from "@/features/billing/statement";

/** Extrato (Pap06): data, descrição neutra (nunca dado do responsável), valor e saldo após cada lançamento. */
export function StatementTable({ lines }: { lines: readonly StatementLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="rounded-card bg-white p-8 text-center" data-testid="statement-empty">
        <p className="text-[16px] font-extrabold">Nenhum lançamento ainda</p>
      </div>
    );
  }
  return (
    <table className="w-full text-[14px]" data-testid="statement-table">
      <thead>
        <tr className="text-texto-3 text-left text-[12px] font-extrabold uppercase">
          <th className="pb-2">Data</th>
          <th className="pb-2">Descrição</th>
          <th className="pb-2 text-right">Valor</th>
          <th className="pb-2 text-right">Saldo após</th>
        </tr>
      </thead>
      <tbody>
        {[...lines].reverse().map((l) => (
          <tr key={l.id} className="border-t border-black/5">
            <td className="py-2 whitespace-nowrap">{formatDateTime(l.date)}</td>
            <td className="py-2 font-semibold">{l.description}</td>
            <td className={`py-2 text-right font-extrabold ${l.amountCents < 0 ? "text-[#8a1c14]" : "text-verde-fundo"}`}>
              {l.amountCents > 0 ? "+" : ""}
              {formatBrl(l.amountCents)}
            </td>
            <td className="py-2 text-right">{formatBrl(l.balanceAfterCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
