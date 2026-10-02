import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminShell } from "@/components/admin/AdminShell";
import { DemoBadge } from "@/components/admin/DemoBadge";
import { PartnerStatusBadge } from "@/components/b2b/StatusBadge";
import { UsageChart } from "@/components/b2b/UsageChart";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { b2bServiceMessage } from "@/features/b2b/messages";
import { getPartnerForAdmin, getPartnerHeaderForAdmin, listPartnerEventsForAdmin } from "@/features/b2b/queries";
import type { B2bPartnerStatus } from "@/features/b2b/states";

import { decidePartnerAction } from "../actions";
import { DecisionForm } from "./DecisionForm";
import { KeyList } from "./KeyList";

// Admin15 detalhe (`/admin/parceiros/[id]`): dados do cadastro (sem expor o e-mail do dono), decisão, chaves
// mascaradas com "Revogar", uso de 30 dias e linha do tempo de eventos.

export const dynamic = "force-dynamic";
export const metadata = { title: "Parceiro · Admin · ListaCerta" };

const PARTNER_TYPE_LABEL: Record<string, string> = { retailer: "Varejista", brand: "Marca", edtech: "EdTech" };
const EVENT_LABEL: Record<string, string> = {
  applied: "Cadastro enviado",
  decided: "Decisão do admin",
  key_created: "Chave criada",
  key_rotated: "Chave rotacionada",
  key_revoked: "Chave revogada",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-texto-3 text-[12px] font-extrabold tracking-[0.06em] uppercase">{k}</dt>
      <dd className="font-bold break-words">{v}</dd>
    </div>
  );
}

function formatDateTime(v: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { user } = await requireAccess("/admin/parceiros");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { ok, erro } = await searchParams;
  const actor = await getSessionActor();

  let overview: Awaited<ReturnType<typeof getPartnerForAdmin>> = null;
  let header: Awaited<ReturnType<typeof getPartnerHeaderForAdmin>> = null;
  let events: Awaited<ReturnType<typeof listPartnerEventsForAdmin>> = [];
  let failed = false;
  try {
    if (actor) [overview, header, events] = await Promise.all([getPartnerForAdmin(actor, id.data), getPartnerHeaderForAdmin(actor, id.data), listPartnerEventsForAdmin(actor, id.data)]);
  } catch (error) {
    console.error("parceiro (admin, detalhe)", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  if (!failed && (!overview || !header)) notFound();

  return (
    <AdminShell active="/admin/parceiros" email={user.email} breadcrumb="Admin / Parceiros B2B / Detalhe" title={header?.tradeName ?? "Parceiro"} actions={<Link href="/admin/parceiros" className="text-[14px] font-extrabold underline">Voltar à lista</Link>}>
      {failed || !overview || !header ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar. <Link href={`/admin/parceiros/${id.data}`} className="underline">Tentar de novo</Link>
        </p>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
          <section className="flex flex-col gap-5">
            {ok ? <p role="status" className="bg-verde-certo/20 text-verde-fundo rounded-campo px-4 py-3 text-[14px] font-bold">Decisão registrada.</p> : null}
            {erro ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">{b2bServiceMessage(erro) ?? "Não foi possível concluir agora."}</p> : null}
            <div className="flex flex-col gap-4 rounded-[24px] bg-white p-6">
              <div className="flex flex-wrap items-center gap-2">
                <PartnerStatusBadge status={overview.status as B2bPartnerStatus} />
                {header.isDemo ? <DemoBadge /> : null}
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Row k="Empresa" v={header.tradeName} />
                <Row k="Razão social" v={header.legalName} />
                <Row k="CNPJ" v={header.cnpj} />
                <Row k="Tipo" v={PARTNER_TYPE_LABEL[header.partnerType] ?? header.partnerType} />
                <Row k="Contato" v={header.contactName} />
                <Row k="Cobertura" v={header.coverageUfs ? header.coverageUfs.join(", ") : "Nacional"} />
              </dl>
              {header.statusReason ? <p className="bg-campo rounded-campo px-4 py-3 text-[14px] font-semibold">Motivo registrado: {header.statusReason}</p> : null}
            </div>
            <div className="flex flex-col gap-3 rounded-[24px] bg-white p-6">
              <h2 className="text-[17px] font-extrabold">Chaves</h2>
              <KeyList partnerId={id.data} keys={overview.keys} />
            </div>
            <div className="flex flex-col gap-3 rounded-[24px] bg-white p-6">
              <h2 className="text-[17px] font-extrabold">Chamadas por dia (30 dias)</h2>
              <UsageChart callsByDay={overview.callsByDay} />
            </div>
            <div className="flex flex-col gap-2 rounded-[24px] bg-white p-6">
              <h2 className="text-[17px] font-extrabold">Linha do tempo</h2>
              {events.length === 0 ? (
                <p className="text-texto-3 text-[13px] font-semibold">Nenhum evento ainda.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {events.map((e) => (
                    <li key={e.id} className="border-linha flex flex-wrap items-baseline gap-2 border-t pt-2 text-[13px] font-semibold first:border-0 first:pt-0">
                      <span className="text-texto-3">{formatDateTime(e.createdAt)}</span>
                      <span className="font-extrabold">{EVENT_LABEL[e.eventType] ?? e.eventType}</span>
                      {e.fromStatus && e.toStatus ? <span className="text-texto-2">{e.fromStatus} → {e.toStatus}</span> : null}
                      {e.reason ? <span className="text-texto-3">· {e.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <aside className="flex flex-col gap-3">
            <h2 className="text-[17px] font-extrabold">Decisão</h2>
            <DecisionForm
              partnerId={id.data}
              status={overview.status as B2bPartnerStatus}
              action={decidePartnerAction}
              plan={overview.plan}
              coverageUfs={overview.coverageUfs}
              limits={overview.limits}
            />
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
