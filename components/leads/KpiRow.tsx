import type { Kpis } from "@/features/leads/funnel";

import { moneyOrUnavailable } from "./format";

type Props = { kpis: Kpis | null };

function Kpi({ value, label, tone }: { value: string; label: string; tone: "dark" | "light" | "green" }) {
  const cls = tone === "dark" ? "bg-tinta text-papel" : tone === "green" ? "bg-verde-certo text-tinta" : "bg-white text-tinta";
  return (
    <div className={`${cls} rounded-card p-5`}>
      <p className="text-[28px] leading-none font-extrabold tracking-[-0.03em]">{value}</p>
      <p className="mt-1.5 text-[13px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

/** KPIs do banco (Pap02). `null` = não dá para afirmar (lista cortada): tudo "indisponível". */
export function KpiRow({ kpis }: Props) {
  const n = (v: number | undefined): string => (v === undefined ? "indisponível" : String(v));
  return (
    <section aria-label="Indicadores" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
      <Kpi tone="dark" value={n(kpis?.newCount)} label="leads recebidos, ainda novos" />
      <Kpi tone="light" value={n(kpis?.awaitingCount)} label="ainda não atendidos" />
      <Kpi tone="green" value={n(kpis?.soldThisWeek)} label="vendas declaradas, últimos 7 dias" />
      <Kpi tone="light" value={kpis ? moneyOrUnavailable(kpis.declaredMonthCents) : "indisponível"} label="valor declarado no mês" />
    </section>
  );
}
