import type { Metadata } from "next";
import Link from "next/link";

import { FunnelTabs } from "@/components/leads/FunnelTabs";
import { KpiRow } from "@/components/leads/KpiRow";
import { LeadCards } from "@/components/leads/LeadCards";
import { LeadTable } from "@/components/leads/LeadTable";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { computeKpis, FUNNEL_TABS, matchesTab, parseTab, type FunnelTabId } from "@/features/leads/funnel";
import { errorMessageForCode } from "@/features/leads/messages";
import { listStationeryLeads } from "@/features/leads/queries";
import { getOwnerContext } from "@/features/stationeries/session";

export const metadata: Metadata = { title: "Leads · ListaCerta" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function LeadsPage({ searchParams }: PageProps<"/papelaria/leads">) {
  const sp = await searchParams;
  const ctx = await getOwnerContext("/papelaria/leads");
  if (!ctx) {
    return (
      <>
        <PageHeader crumb="Papelaria" title="Leads da lista escolar" />
        <Notice kind="info">Nenhuma papelaria vinculada a esta conta.</Notice>
      </>
    );
  }
  const tab = parseTab(one(sp.aba));
  const school = one(sp.escola) ?? "";
  const erro = errorMessageForCode(one(sp.erro));
  const { rows, truncated } = await listStationeryLeads(ctx.actor, ctx.stationery.id);
  const schools = [...new Set(rows.map((r) => r.schoolName))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const scoped = school && schools.includes(school) ? rows.filter((r) => r.schoolName === school) : rows;
  const counts = Object.fromEntries(FUNNEL_TABS.map((t) => [t.id, scoped.filter((r) => matchesTab(r.status, t.id)).length])) as Record<FunnelTabId, number>;
  const shown = scoped.filter((r) => matchesTab(r.status, tab));
  const now = new Date();
  // KPIs só do que está carregado por inteiro: lista cortada = "indisponível".
  const kpis = truncated ? null : computeKpis(rows, now);
  const href = (t: FunnelTabId): string => {
    const q = new URLSearchParams();
    if (t !== "all") q.set("aba", t);
    if (school && schools.includes(school)) q.set("escola", school);
    const s = q.toString();
    return s ? `/papelaria/leads?${s}` : "/papelaria/leads";
  };
  const frozen = ctx.stationery.status === "suspended";
  return (
    <>
      <PageHeader crumb="Papelaria / Leads" title="Leads da lista escolar" />
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {frozen ? <Notice kind="info">Papelaria suspensa: você só consulta o histórico.</Notice> : null}
      {ctx.stationery.status === "paused" ? <Notice kind="info">Papelaria pausada: não recebe leads novos, mas você segue atendendo os que já chegaram.</Notice> : null}
      {truncated ? <Notice kind="info">Há mais de 500 leads: os indicadores ficam indisponíveis e a lista mostra os mais recentes.</Notice> : null}
      <KpiRow kpis={kpis} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FunnelTabs active={tab} counts={counts} hrefFor={href} />
        {schools.length > 1 ? (
          <form method="get" className="flex items-center gap-2">
            {tab !== "all" ? <input type="hidden" name="aba" value={tab} /> : null}
            <select name="escola" defaultValue={school} aria-label="Filtrar por escola" className="bg-white rounded-campo h-11 px-3 text-[14px] font-bold">
              <option value="">Todas as escolas</option>
              {schools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button type="submit" className="bg-tinta text-papel rounded-botao h-11 px-4 text-[14px] font-extrabold">Filtrar</button>
          </form>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-card bg-white p-8 text-center" data-testid="leads-empty">
          <p className="text-[16px] font-extrabold">Nenhum lead ainda</p>
          <p className="text-texto-2 mt-1 text-[14px] font-semibold">
            Quando um responsável pedir cotação à sua papelaria, ele aparece aqui.{" "}
            {ctx.stationery.status === "active" ? null : <Link href="/papelaria" className="text-verde-fundo underline">Publique a papelaria</Link>}
          </p>
        </div>
      ) : (
        <>
          <LeadTable rows={shown} now={now} />
          <LeadCards rows={shown} now={now} />
        </>
      )}
    </>
  );
}
