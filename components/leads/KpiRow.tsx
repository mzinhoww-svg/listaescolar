import type { Kpis } from "@/features/leads/funnel";

import { moneyOrUnavailable } from "./format";

type Props = { kpis: Kpis | null; balanceCents?: number | null };

function Kpi({ value, label, tone }: { value: string; label: string; tone: "dark" | "light" }) {
  const cls = tone === "dark" ? "bg-tinta text-papel" : "bg-white text-tinta";
  const numeric = /^[\d.,R$\s]+$/.test(value);
  return (
    <div className={`${cls} rounded-card p-4`}>
      <p className={`${numeric ? "text-[28px]" : "text-[16px]"} leading-none font-extrabold tracking-[-0.03em] break-words`}>{value}</p>
      <p className="mt-1.5 text-[13px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

/** KPIs do banco (Pap02). `null` = não dá para afirmar (lista cortada): tudo "indisponível". */
export function KpiRow({ kpis, balanceCents }: Props) {
  const n = (v: number | undefined): string => (v === undefined ? "indisponível" : String(v));
  return (
    <section aria-label="Indicadores" className="order-last mt-6 mb-6 grid grid-cols-2 gap-3 md:order-none md:mt-0 lg:grid-cols-5" data-testid="kpis">
      <Kpi tone="dark" value={n(kpis?.newCount)} label="leads recebidos, ainda novos" />
      <Kpi tone="light" value={n(kpis?.awaitingCount)} label="ainda não atendidos" />
      <Kpi tone="light" value={n(kpis?.soldThisWeek)} label="vendas declaradas, últimos 7 dias" />
      <Kpi tone="light" value={kpis ? moneyOrUnavailable(kpis.declaredMonthCents) : "indisponível"} label="valor declarado no mês" />
      {balanceCents === undefined ? null : <Kpi tone="light" value={moneyOrUnavailable(balanceCents)} label="Saldo" />}
    </section>
  );
}
