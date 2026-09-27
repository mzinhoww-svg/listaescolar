import type { Metadata } from "next";
import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { Notice } from "@/components/stationeries/PanelShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { errorMessageForCode } from "@/features/conversion/messages";
import type { AuditRow, ReviewView } from "@/features/conversion/ports";
import { getConversionService } from "@/features/conversion/wiring";

import { ReviewModeration } from "./ReviewModeration";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Auditoria de conversão · Admin · ListaCerta", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

/** Admin11: declarado (a papelaria disse "Vendi") x confirmado (regra de 2 de 3 sinais), mais moderação de avaliações. */
export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string | string[]; ok?: string | string[] }> }) {
  const { user } = await requireAccess("/admin");
  const sp = await searchParams;
  const erro = errorMessageForCode(one(sp.erro));
  let rows: AuditRow[] = [];
  let reviews: ReviewView[] = [];
  let failed = false;
  try {
    const a = await getSessionActor();
    if (a) {
      const svc = getConversionService();
      [rows, reviews] = await Promise.all([svc.listAuditRows(a, 100), svc.listRecentReviewsForAdmin(a, 50)]);
    }
  } catch (error) {
    console.error("listar auditoria de conversão", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  const divergent = rows.filter((r) => r.divergent).length;
  return (
    <AdminShell active="/admin/auditoria" email={user.email} breadcrumb="Admin / Auditoria" title="Auditoria de conversão">
      {one(sp.ok) ? <Notice kind="ok">Avaliação ocultada.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {failed ? (
        <Notice kind="error">
          Não foi possível carregar. <Link href="/admin/auditoria" className="underline">Tentar de novo</Link>
        </Notice>
      ) : (
        <>
          <p className="text-texto-2 mb-4 text-[14px] font-semibold">
            {rows.length} pedidos analisados · {divergent} com divergência entre o declarado pela papelaria e a regra de 2 de 3 sinais.
          </p>
          <div className="rounded-card overflow-x-auto bg-white">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-texto-3 border-b border-black/10 font-bold">
                <tr>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Papelaria</th>
                  <th className="px-4 py-3">Declarado</th>
                  <th className="px-4 py-3">Sinais</th>
                  <th className="px-4 py-3">Confirmado</th>
                  <th className="px-4 py-3">Quando</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-texto-3 px-4 py-6 font-semibold">Nenhum pedido ainda.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.leadId} className={`border-b border-black/5 ${r.divergent ? "bg-erro-fundo/40" : ""}`}>
                      <td className="px-4 py-3 font-bold">{r.code}</td>
                      <td className="px-4 py-3">{r.stationeryName}</td>
                      <td className="px-4 py-3">{r.declaredConverted ? "Vendi" : "—"}</td>
                      <td className="px-4 py-3">
                        {r.signals.stationeryConfirmed ? "papelaria" : null}
                        {r.signals.stationeryConfirmed && r.signals.parentConfirmed ? " + " : null}
                        {r.signals.parentConfirmed ? "responsável" : null}
                        {!r.signals.stationeryConfirmed && !r.signals.parentConfirmed ? "nenhum" : null}
                        {" "}({r.signals.signalCount}/3; Pix pela plataforma indisponível nesta fase)
                      </td>
                      <td className="px-4 py-3 font-extrabold">{r.signals.confirmed ? "Confirmada" : "Não confirmada"}</td>
                      <td className="px-4 py-3">{formatWhen(r.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <h2 className="mt-8 mb-3 text-[18px] font-extrabold">Avaliações recentes</h2>
          <ReviewModeration reviews={reviews} />
        </>
      )}
    </AdminShell>
  );
}
