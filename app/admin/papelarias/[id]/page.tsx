import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminShell } from "@/components/admin/AdminShell";
import { Notice } from "@/components/stationeries/PanelShell";
import { formatDateTime } from "@/components/stationeries/StatusPanel";
import { requireAccess } from "@/features/auth/guard";
import { formatCnpj } from "@/features/stationeries/cnpj";
import { errorMessageForCode, STATUS_LABEL } from "@/features/stationeries/messages";
import { getAdminDetail, listStatusEvents } from "@/features/stationeries/queries";
import { adminActions } from "@/features/stationeries/admin-actions";

import { adminTransitionAction } from "../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { user } = await requireAccess("/admin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const detail = await getAdminDetail(id);
  if (!detail) notFound();
  const events = await listStatusEvents(id);
  const actions = adminActions(detail.status);
  const dl: [string, string][] = [
    ["Razão social", detail.legalName ?? "indisponível"],
    ["CNPJ", formatCnpj(detail.cnpj)],
    ["Bairro", detail.neighborhood ?? "indisponível"],
    ["WhatsApp", detail.whatsapp ?? "indisponível"],
    ["E-mail", detail.email ?? "indisponível"],
    ["Retirada / entrega", [detail.offersPickup ? "retirada" : null, detail.offersDelivery ? "entrega" : null].filter(Boolean).join(" e ") || "indisponível"],
    ["Aceite LGPD", detail.lgpdAcceptedAt ? formatDateTime(detail.lgpdAcceptedAt) : "não registrado"],
    ["Cadastro", formatDateTime(detail.createdAt)],
  ];
  return (
    <AdminShell
      active="/admin/papelarias"
      email={user.email}
      breadcrumb="Admin / Papelarias"
      title={detail.tradeName}
      actions={<Link href="/admin/papelarias" className="text-verde-fundo text-[14px] font-extrabold underline">Voltar à fila</Link>}
    >
      {sp.ok ? <Notice kind="ok">Status atualizado.</Notice> : null}
      {sp.erro ? <Notice kind="error">{errorMessageForCode(sp.erro)}</Notice> : null}
      <p className="mb-4 text-[15px] font-extrabold">
        Status: <span data-testid="status-label">{STATUS_LABEL[detail.status]}</span>
        {detail.statusReason ? <span className="text-texto-2 font-bold"> · {detail.statusReason}</span> : null}
      </p>
      <dl className="mb-6 grid gap-3 rounded-card bg-white p-5 sm:grid-cols-2">
        {dl.map(([k, v]) => (
          <div key={k}>
            <dt className="text-texto-3 text-[12px] font-extrabold uppercase">{k}</dt>
            <dd className="text-[14px] font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="acoes" className="mb-6 flex flex-col gap-3 rounded-card bg-white p-5">
        <h2 id="acoes" className="text-[16px] font-extrabold">Ações</h2>
        {actions.length === 0 ? <p className="text-texto-3 text-[14px]">Sem ações disponíveis neste status.</p> : null}
        {actions.map((a) => (
          <form key={a.to} action={adminTransitionAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={detail.id} />
            <input type="hidden" name="to" value={a.to} />
            <input
              name="reason"
              maxLength={500}
              required={a.reasonRequired}
              placeholder={a.reasonRequired ? "Motivo (obrigatório)" : "Motivo (opcional)"}
              aria-label={`Motivo para ${a.label.toLowerCase()}`}
              className="bg-campo h-11 min-w-[260px] flex-1 rounded-campo px-4 text-[14px] font-medium"
            />
            <button type="submit" className={`h-11 rounded-botao px-5 text-[14px] font-extrabold ${a.tone === "danger" ? "border-[1.5px] border-[#8a1c14] text-[#8a1c14]" : "bg-tinta text-papel"}`}>
              {a.label}
            </button>
          </form>
        ))}
      </section>
      <section aria-labelledby="eventos" className="rounded-card bg-white p-5">
        <h2 id="eventos" className="mb-2 text-[16px] font-extrabold">Eventos</h2>
        {events.length === 0 ? (
          <p className="text-texto-3 text-[14px]">Sem eventos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="text-[14px]">
                <span className="font-extrabold">{STATUS_LABEL[e.fromStatus]} → {STATUS_LABEL[e.toStatus]}</span>
                <span className="text-texto-3"> · {formatDateTime(e.createdAt)} · {e.actorRole}</span>
                {e.reason ? <span className="text-texto-2"> · {e.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
