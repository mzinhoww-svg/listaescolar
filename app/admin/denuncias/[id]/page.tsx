import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminShell } from "@/components/admin/AdminShell";
import { Notice } from "@/components/stationeries/PanelShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getListSummaryForAdmin } from "@/features/admin/list-lookup";
import { LIST_STATE_LABEL } from "@/features/admin/labels";
import { reportErrorMessage } from "@/features/reports/messages";
import { REPORT_REASON_LABEL, REPORT_STATUS_LABEL, REPORT_TARGET_TYPE_LABEL, type ReportView } from "@/features/reports/ports";
import { resolveReportAction } from "@/features/reports/actions";
import { getReportsService } from "@/features/reports/wiring";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Denúncia · Admin · ListaCerta", robots: { index: false, follow: false } };

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { user } = await requireAccess("/admin/denuncias");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;
  const actor = await getSessionActor();
  let report: ReportView | null = null;
  let failed = false;
  try {
    if (actor) report = await (await getReportsService()).getById(actor, id.data);
  } catch (error) {
    console.error("denúncia (admin)", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  const list = report?.targetType === "school_list" && actor ? await getListSummaryForAdmin(actor, report.targetId).catch(() => null) : null;

  return (
    <AdminShell active="/admin/denuncias" email={user.email} breadcrumb="Admin / Denúncias / Detalhe" title="Denúncia" actions={<Link href="/admin/denuncias" className="text-[14px] font-extrabold underline">Voltar à fila</Link>}>
      {sp.ok ? <Notice kind="ok">Denúncia atualizada.</Notice> : null}
      {sp.erro ? <Notice kind="error">{reportErrorMessage(sp.erro)}</Notice> : null}
      {failed || !report ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          {failed ? "Não foi possível carregar." : "Denúncia não encontrada."}
        </p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-6">
            <span className="bg-campo text-texto-2 w-fit rounded-botao px-2.5 py-1 text-[11px] font-extrabold">{REPORT_STATUS_LABEL[report.status]}</span>
            <h2 className="text-[20px] font-extrabold">{REPORT_TARGET_TYPE_LABEL[report.targetType]} · {REPORT_REASON_LABEL[report.reason]}</h2>
            <dl className="grid gap-2 text-[14px] sm:grid-cols-2">
              <div><dt className="text-texto-3 font-semibold">Aberta em</dt><dd className="font-bold">{formatWhen(report.createdAt)}</dd></div>
              <div><dt className="text-texto-3 font-semibold">Código do detalhe</dt><dd className="font-bold">{report.detailCode ?? "—"}</dd></div>
              {report.resolvedAt ? (
                <>
                  <div><dt className="text-texto-3 font-semibold">Resolvida em</dt><dd className="font-bold">{formatWhen(report.resolvedAt)}</dd></div>
                  <div><dt className="text-texto-3 font-semibold">Resolução</dt><dd className="font-bold">{report.resolutionNote ?? report.resolution}</dd></div>
                </>
              ) : null}
            </dl>
            {list ? (
              <div className="bg-papel rounded-campo p-4 text-[14px]">
                <p className="font-extrabold">
                  <Link href={`/escolas/${list.schoolInep}`} className="hover:underline">{list.schoolName}</Link>
                </p>
                <p className="text-texto-2">{list.gradeName} · {list.schoolYear} · {LIST_STATE_LABEL[list.status] ?? list.status}</p>
                {list.status === "published" ? (
                  <Link href={`/admin/listas/${list.id}`} className="text-verde-fundo mt-2 inline-block font-extrabold underline">Ver lista e arquivar</Link>
                ) : null}
              </div>
            ) : null}
          </section>
          <aside className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <h2 className="text-[16px] font-extrabold">Resolver</h2>
            {report.status === "resolved" || report.status === "dismissed" ? (
              <p className="text-texto-3 text-[13px] font-semibold">Esta denúncia já foi encerrada.</p>
            ) : (
              <form action={resolveReportAction} className="flex flex-col gap-3">
                <input type="hidden" name="reportId" value={report.id} />
                {report.status === "open" ? (
                  <button type="submit" name="status" value="reviewing" className="border-tinta text-tinta rounded-botao h-11 border-[1.5px] bg-transparent text-[14px] font-extrabold">
                    Colocar em análise
                  </button>
                ) : null}
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                  Procede?
                  <select name="resolution" defaultValue="" className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium">
                    <option value="" disabled>Escolha</option>
                    <option value="upheld">Sim, procede</option>
                    <option value="no_action">Não procede</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                  Código da resolução (opcional, sem prosa)
                  <input name="resolutionNote" maxLength={60} placeholder="lista_arquivada" className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
                </label>
                <div className="flex gap-2">
                  <button type="submit" name="status" value="resolved" className="bg-tinta text-papel rounded-botao h-11 flex-1 text-[14px] font-extrabold">Resolver</button>
                  <button type="submit" name="status" value="dismissed" className="border-tinta text-tinta rounded-botao h-11 flex-1 border-[1.5px] bg-transparent text-[14px] font-extrabold">Arquivar sem ação</button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
