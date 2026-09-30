import type { Metadata } from "next";
import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { OPEN_REPORT_STATUSES, REPORT_REASON_LABEL, REPORT_STATUS_LABEL, REPORT_TARGET_TYPE_LABEL, REPORT_STATUSES, type ReportStatus, type ReportView } from "@/features/reports/ports";
import { getReportsService } from "@/features/reports/wiring";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Denúncias · Admin · ListaCerta", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { user } = await requireAccess("/admin/denuncias");
  const sp = await searchParams;
  const statusParam = one(sp.status);
  const status: readonly ReportStatus[] = statusParam && REPORT_STATUSES.includes(statusParam as ReportStatus) ? [statusParam as ReportStatus] : OPEN_REPORT_STATUSES;

  const actor = await getSessionActor();
  let rows: ReportView[] = [];
  let failed = false;
  try {
    if (actor) rows = await (await getReportsService()).listQueue(actor, { status });
  } catch (error) {
    console.error("fila de denúncias", error instanceof Error ? error.message : "erro");
    failed = true;
  }

  return (
    <AdminShell active="/admin/denuncias" email={user.email} breadcrumb="Admin / Denúncias" title="Denúncias">
      <nav className="mb-4 flex flex-wrap gap-2 text-[13px] font-bold" aria-label="Filtrar por estado">
        <Link href="/admin/denuncias" className={`min-h-11 inline-flex items-center justify-center rounded-botao px-3 py-1.5 ${!statusParam ? "bg-tinta text-papel" : "bg-campo"}`}>Abertas</Link>
        {REPORT_STATUSES.map((s) => (
          <Link key={s} href={`/admin/denuncias?status=${s}`} className={`min-h-11 inline-flex items-center justify-center rounded-botao px-3 py-1.5 ${statusParam === s ? "bg-tinta text-papel" : "bg-campo"}`}>
            {REPORT_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      {failed ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível carregar.</p>
      ) : (
        <div className="rounded-card overflow-x-auto bg-white" tabIndex={0} role="region" aria-label="Tabela (role para o lado para ver todas as colunas)">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-texto-3 border-b border-black/10 font-bold">
              <tr>
                <th className="px-4 py-3">Alvo</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Aberta em</th>
                <th className="px-4 py-3 sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(15,27,45,0.18)]"><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="text-texto-3 px-4 py-6 font-semibold">Nenhuma denúncia neste filtro.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-black/5">
                    <td className="px-4 py-3 font-bold">{REPORT_TARGET_TYPE_LABEL[r.targetType]}</td>
                    <td className="px-4 py-3">{REPORT_REASON_LABEL[r.reason]}</td>
                    <td className="px-4 py-3">{REPORT_STATUS_LABEL[r.status]}</td>
                    <td className="px-4 py-3">{formatWhen(r.createdAt)}</td>
                    <td className="px-4 py-3 sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(15,27,45,0.18)]"><Link href={`/admin/denuncias/${r.id}`} className="text-verde-fundo inline-flex min-h-11 min-w-11 items-center justify-center font-extrabold underline">Abrir</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
