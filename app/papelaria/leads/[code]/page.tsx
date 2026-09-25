import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatWhen, moneyOrUnavailable } from "@/components/leads/format";
import { ItemsTable } from "@/components/leads/ItemsTable";
import { DemoSeal, StatusBadge } from "@/components/leads/StatusBadge";
import { Timeline } from "@/components/leads/Timeline";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { normalizeLeadCode } from "@/features/leads/code";
import { errorMessageForCode } from "@/features/leads/messages";
import { estimateOwnCatalog, getStationeryLead } from "@/features/leads/queries";
import { getLeadService } from "@/features/leads/wiring";
import { CLOSE_REASON_LABEL, isTerminal } from "@/features/leads/state";
import { getOwnerContext } from "@/features/stationeries/session";

import { CopyCode } from "./CopyCode";
import { StatusForm } from "./StatusForm";

export const metadata: Metadata = { title: "Lead · ListaCerta" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function LeadPage({ params, searchParams }: PageProps<"/papelaria/leads/[code]">) {
  const { code: raw } = await params;
  const sp = await searchParams;
  const code = normalizeLeadCode(raw);
  if (code === null) notFound();
  const ctx = await getOwnerContext(`/papelaria/leads/${code}`);
  if (!ctx) notFound();
  // Abrir o detalhe marca `viewed` (idempotente). Alheio, inexistente, vencido ou papelaria suspensa: segue e a leitura decide.
  try {
    await getLeadService().markViewed(ctx.actor, code);
  } catch (error) {
    if (error instanceof Error) console.error("marcar lead como visto", error.name);
  }
  // O `stationery_id` vem SEMPRE da sessão; lead de outra papelaria e código inexistente dão o mesmo 404.
  const detail = await getStationeryLead(ctx.actor, ctx.stationery.id, code);
  if (!detail) notFound();
  const { lead, items, events } = detail;
  const estimate = await estimateOwnCatalog(ctx.stationery, items);
  const erro = errorMessageForCode(one(sp.erro));
  const frozen = ctx.stationery.status === "suspended";
  const closed = isTerminal(lead.status);
  return (
    <>
      <PageHeader crumb={`Leads / ${lead.code}`} title={`Lead ${lead.code}`}>
        <span className="flex items-center gap-2">
          {lead.isDemo ? <DemoSeal /> : null}
          <StatusBadge status={lead.status} />
        </span>
      </PageHeader>
      {one(sp.ok) ? <Notice kind="ok">Registrado.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {frozen ? <Notice kind="info">Papelaria suspensa: você só consulta o histórico.</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-card flex flex-wrap items-center justify-between gap-2 bg-white px-5 py-4">
            <p className="text-[16px] font-extrabold">{lead.schoolName} · {lead.gradeLabel} · {lead.schoolYear}</p>
            <p className="text-texto-3 text-[13px] font-bold">{lead.itemCount} itens{lead.neighborhood ? ` · bairro ${lead.neighborhood}` : ""}</p>
          </div>
          <ItemsTable estimate={estimate} />
        </div>
        <div className="flex flex-col gap-4">
          <section className="rounded-card flex flex-col gap-2 bg-white p-5" aria-label="Responsável">
            <p className="text-texto-3 text-[13px] font-bold">Responsável</p>
            <p className="text-[16px] font-extrabold">identificado pelo código</p>
            <p className="text-texto-2 text-[13px] font-semibold">O responsável chama você pelo WhatsApp com o código {lead.code}. Nome, e-mail e telefone não passam pela ListaCerta.</p>
            <div><CopyCode code={lead.code} /></div>
            <dl className="text-[13px] font-semibold">
              <div className="flex justify-between gap-3"><dt className="text-texto-3">Orçamento informado</dt><dd>{moneyOrUnavailable(lead.quotedTotalCents)}{lead.quotedAt ? ` · ${formatWhen(lead.quotedAt)}` : ""}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-texto-3">Venda declarada</dt><dd>{lead.declaredAt ? `${moneyOrUnavailable(lead.declaredSaleCents)} · ${formatWhen(lead.declaredAt)}` : "não declarada"}</dd></div>
              {lead.closeReason ? <div className="flex justify-between gap-3"><dt className="text-texto-3">Motivo</dt><dd>{CLOSE_REASON_LABEL[lead.closeReason]}</dd></div> : null}
            </dl>
          </section>
          {closed || frozen ? (
            <p className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold" data-testid="lead-blocked">
              {frozen ? "Sem ações: papelaria suspensa." : "Lead encerrado: sem novas ações."}
            </p>
          ) : (
            <StatusForm code={lead.code} status={lead.status} />
          )}
          <Timeline events={events} side="stationery" />
        </div>
      </div>
    </>
  );
}
