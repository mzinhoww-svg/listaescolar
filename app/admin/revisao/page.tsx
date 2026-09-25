import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { ReviewQueueTable } from "@/components/review/ReviewQueueTable";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getReviewQueue } from "@/features/review/queries";
import { QUEUE_LIMIT, type QueueRow, type QueueTab } from "@/features/review/read-models";

import { loadPublicationInfo, loadSchoolLabels } from "./loaders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisão de listas · ListaCerta" };

const TABS: ReadonlyArray<{ key: string; label: string; tab: QueueTab }> = [
  { key: "pendentes", label: "Pendentes", tab: "pending" },
  { key: "aprovadas", label: "Aprovadas", tab: "approved" },
  { key: "recusadas", label: "Recusadas", tab: "rejected" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { user } = await requireAccess("/admin/revisao");
  const aba = (await searchParams).aba;
  const current = TABS.find((t) => t.key === aba) ?? TABS[0]!;
  let lists: QueueRow[][] | null = null;
  try {
    const actor = await getSessionActor();
    if (actor) lists = await Promise.all(TABS.map((t) => getReviewQueue(actor, t.tab)));
  } catch (error) {
    console.error("fila de revisão", error instanceof Error ? error.name : "erro");
  }
  const rows = lists?.[TABS.indexOf(current)] ?? [];
  const labels = await loadSchoolLabels(rows.map((r) => r.schoolId));
  return (
    <AdminShell active="/admin/revisao" email={user.email} breadcrumb="Admin / Revisão de listas" title="Revisão de listas">
      <nav aria-label="Filtro por situação" className="flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <Link
            key={t.key}
            href={`/admin/revisao?aba=${t.key}`}
            aria-current={t.key === current.key ? "page" : undefined}
            className={`rounded-botao inline-flex min-h-11 items-center px-5 text-[14px] font-extrabold ${t.key === current.key ? "bg-tinta text-papel" : "bg-campo"}`}
          >
            {t.label}{lists ? ` (${(lists[i]?.length ?? 0) >= QUEUE_LIMIT ? `${QUEUE_LIMIT}+` : (lists[i]?.length ?? 0)})` : ""}
          </Link>
        ))}
      </nav>
      {lists === null ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar a fila. <Link href={`/admin/revisao?aba=${current.key}`} className="underline">Tentar de novo</Link>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-texto-2 rounded-[24px] bg-white p-8 text-[15px] font-bold">Nenhuma lista nesta aba.</p>
      ) : (
        <ReviewQueueTable rows={rows} labels={labels} demoPublication={loadPublicationInfo().demo} />
      )}
    </AdminShell>
  );
}
