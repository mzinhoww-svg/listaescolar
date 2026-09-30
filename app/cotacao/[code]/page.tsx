import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Screen } from "@/components/auth/Screen";
import { BackHeader } from "@/components/cart/CartStates";
import { SubmitButton } from "@/components/cart/SubmitButton";
import { formatWhen, moneyOrUnavailable } from "@/components/leads/format";
import { LeadNextStep } from "@/components/leads/LeadNextStep";
import { MessagePreview } from "@/components/leads/MessagePreview";
import { DemoSeal, StatusBadge } from "@/components/leads/StatusBadge";
import { Timeline } from "@/components/leads/Timeline";
import { buttonClass } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { requireAccess } from "@/features/auth/guard";
import { cancelLeadAction, openWhatsappAction } from "@/features/leads/actions";
import { normalizeLeadCode } from "@/features/leads/code";
import { buildLeadMessage, leadListUrl } from "@/features/leads/message";
import { errorMessageForCode } from "@/features/leads/messages";
import { getMyLead } from "@/features/leads/queries";
import { PURCHASE_QUESTION_STATUSES } from "@/features/leads/next-step";
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
  // Respondida sem valor: sem prévia da mensagem nem "Cancelar" (o pedido foi atendido; o próximo passo é falar com a papelaria).
  const answeredWithoutValue = lead.status === "quote_sent" && lead.quotedTotalCents === null;
  const canCancel = open && !answeredWithoutValue;
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
      {ok ? <InlineStatus tone="success">Pedido cancelado.</InlineStatus> : null}
      {erro ? <InlineStatus tone="error">{erro}</InlineStatus> : null}
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
      <LeadNextStep status={lead.status} quoted={lead.quotedTotalCents !== null} />
      {preview && !answeredWithoutValue ? <MessagePreview text={preview} /> : null}
      {open ? (
        <>
          <form action={openWhatsappAction}>
            <input type="hidden" name="code" value={lead.code} />
            <SubmitButton variant="whatsapp" size="lg" className="w-full" pendingLabel="Abrindo o WhatsApp">
              Abrir WhatsApp
            </SubmitButton>
          </form>
          {PURCHASE_QUESTION_STATUSES.includes(lead.status) ? (
            <Link href="/conta/compras" className={buttonClass("outline", "md", "w-full")}>
              Informar a compra
            </Link>
          ) : null}
          {canCancel ? (
            <ConfirmDialog
              triggerLabel="Cancelar este pedido de cotação"
              triggerStyle="button"
              title="Cancelar este pedido de cotação?"
              body="A papelaria deixa de ver este pedido. Você pode fazer um novo pedido quando quiser."
              confirmLabel="Cancelar pedido"
              action={cancelLeadAction}
              hidden={{ code: lead.code }}
            />
          ) : null}
        </>
      ) : (
        <>
          <p className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold" data-testid="lead-closed">Este pedido está encerrado.</p>
          {PURCHASE_QUESTION_STATUSES.includes(lead.status) ? (
            <Link href="/conta/compras" className={buttonClass("outline", "md", "w-full")}>
              Informar a compra
            </Link>
          ) : null}
        </>
      )}
      <Timeline events={events} side="requester" />
    </Screen>
  );
}
