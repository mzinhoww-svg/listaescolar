import { formatBrl } from "@/features/billing/money";

type Props = { pendingCents: number; schoolsWithRepasse: number; executedCents: number };

/** KPIs do topo do Admin13 (mesmo padrão visual do Pap02 KpiRow): pendente, escolas com repasse, já executado. */
export function PayoutKpiRow({ pendingCents, schoolsWithRepasse, executedCents }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="bg-tinta text-papel rounded-card p-5">
        <p className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">{formatBrl(pendingCents)}</p>
        <p className="mt-1 text-[13px] font-semibold text-white/70">a repassar agora</p>
      </div>
      <div className="rounded-card bg-white p-5">
        <p className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">{schoolsWithRepasse}</p>
        <p className="text-texto-2 mt-1 text-[13px] font-semibold">escola(s)/APM com repasse pendente</p>
      </div>
      <div className="rounded-card bg-white p-5">
        <p className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">{formatBrl(executedCents)}</p>
        <p className="text-texto-2 mt-1 text-[13px] font-semibold">já pago (lotes executados)</p>
      </div>
    </div>
  );
}
