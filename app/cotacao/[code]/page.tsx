import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Screen } from "@/components/auth/Screen";
import { BackHeader } from "@/components/cart/CartStates";
import { formatWhen, moneyOrUnavailable } from "@/components/leads/format";
import { MessagePreview } from "@/components/leads/MessagePreview";
import { DemoSeal, StatusBadge } from "@/components/leads/StatusBadge";
import { Timeline } from "@/components/leads/Timeline";
import { requireAccess } from "@/features/auth/guard";
import { cancelLeadAction, openWhatsappAction } from "@/features/leads/actions";
import { normalizeLeadCode } from "@/features/leads/code";
import { buildLeadMessage, leadListUrl } from "@/features/leads/message";
import { errorMessageForCode } from "@/features/leads/messages";
import { getMyLead } from "@/features/leads/queries";
import { isTerminal } from "@/features/leads/state";
import { getSessionActor } from "@/features/stationeries/actor";
import { getSiteOrigin } from "@/lib/site-url";

export const metadata: Metadata = { title: "Seu pedido de cotação · ListaCerta" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const row = "flex items-baseline justify-between gap-3 text-[14px]";

export default async function CotacaoDetailPage({ params, searchParams }: PageProps<"/cotacao/[code]">) {
  const { code: raw } = await params;
  const sp = await searchParams;
  const code = normalizeLeadCode(raw);
  if (code === null) notFound();
  await requireAccess(`/cotacao/${code}`);
  const actor = await getSessionActor();
  if (!actor) notFound();
  const detail = await getMyLead(actor, code);
  if (!detail) notFound();
  const { lead, events } = detail;
  const erro = errorMessageForCode(one(sp.erro));
  const ok = one(sp.ok) === "cancelado";
  const open = !isTerminal(lead.status) && lead.expiresAt.getTime() > new Date().getTime();
  let preview: string | null = null;
  try {
    const origin = getSiteOrigin();
    preview = buildLeadMessage({ code: lead.code, schoolName: lead.schoolName, gradeLabel: lead.gradeLabel, schoolYear: lead.schoolYear, listUrl: leadListUrl(origin, lead.code) }, { siteOrigin: origin });
  } catch {
    preview = null;
  }
  return (
    <Screen>
      <BackHeader href="/cotacao" title="Seu pedido" />
      {ok ? <p role="status" className="bg-[#d6f3e5] text-verde-fundo rounded-campo px-4 py-3 text-[14px] font-bold">Pedido cancelado.</p> : null}
      {erro ? <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-4 py-3 text-[14px] font-bold">{erro}</p> : null}
      <section className="rounded-card flex flex-col gap-3 bg-white p-6" aria-label="Resumo do pedido">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]" data-testid="lead-code">{lead.code}</h1>
          <StatusBadge status={lead.status} />
        </div>
        {lead.isDemo ? <DemoSeal /> : null}
        <dl className="border-linha-tracejada flex flex-col gap-2 border-t border-dashed pt-3">
          <div className={row}><dt className="text-texto-2">Escola</dt><dd className="font-extrabold">{lead.schoolName}</dd></div>
          <div className={row}><dt className="text-texto-2">Série · ano</dt><dd className="font-extrabold">{lead.gradeLabel} · {lead.schoolYear}</dd></div>
          <div className={row}><dt className="text-texto-2">Papelaria</dt><dd className="font-extrabold">{lead.stationeryName ?? "indisponível"}</dd></div>
          <div className={row}><dt className="text-texto-2">Itens</dt><dd className="font-extrabold">{lead.itemCount}</dd></div>
          <div className={row}>
            <dt className="text-texto-2">Valor informado pela papelaria</dt>
            <dd className="font-extrabold">{moneyOrUnavailable(lead.quotedTotalCents)}{lead.quotedAt ? ` · ${formatWhen(lead.quotedAt)}` : ""}</dd>
          </div>
          <div className={row}><dt className="text-texto-2">Válido até</dt><dd className="font-extrabold">{formatWhen(lead.expiresAt)}</dd></div>
        </dl>
      </section>
      {preview ? <MessagePreview text={preview} /> : null}
      {open ? (
        <>
          <form action={openWhatsappAction}>
            <input type="hidden" name="code" value={lead.code} />
            <button type="submit" className="bg-verde-certo text-tinta rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold">Abrir WhatsApp</button>
          </form>
          <form action={cancelLeadAction}>
            <input type="hidden" name="code" value={lead.code} />
            <button type="submit" className="border-tinta text-tinta rounded-botao flex h-[52px] w-full items-center justify-center border-[1.5px] text-base font-extrabold">Cancelar pedido</button>
          </form>
        </>
      ) : (
        <p className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold" data-testid="lead-closed">Este pedido está encerrado.</p>
      )}
      <Timeline events={events} side="requester" />
      <Link href="/" className="text-verde-fundo text-center text-[14px] font-extrabold underline">Voltar ao início</Link>
    </Screen>
  );
}
