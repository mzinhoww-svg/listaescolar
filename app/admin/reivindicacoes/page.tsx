import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { ClaimQueueCard } from "@/components/claims/ClaimQueueCard";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listClaimQueue } from "@/features/claims/queries";
import type { ClaimStatus } from "@/features/claims/state";
import type { QueueRow } from "@/features/claims/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reivindicações · ListaCerta" };

const TABS: ReadonlyArray<{ key: string; label: string; status: ClaimStatus }> = [
  { key: "pendentes", label: "Pendentes", status: "awaiting_verification" },
  { key: "evidencia", label: "Evidência pedida", status: "insufficient_evidence" },
  { key: "aprovadas", label: "Aprovadas", status: "approved" },
  { key: "recusadas", label: "Recusadas", status: "rejected" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { user } = await requireAccess("/admin/reivindicacoes");
  const aba = (await searchParams).aba;
  const tab = TABS.find((t) => t.key === aba) ?? TABS[0]!;
  let lists: QueueRow[][] | null = null;
  try {
    const actor = await getSessionActor();
    if (actor) lists = await Promise.all(TABS.map((t) => listClaimQueue(actor, { status: t.status, limit: 100 })));
  } catch (error) {
    console.error("fila de reivindicações", error instanceof Error ? error.message : "erro");
  }
  const rows = lists?.[TABS.indexOf(tab)] ?? [];
  return (
    <AdminShell active="/admin/reivindicacoes" email={user.email} breadcrumb="Admin / Reivindicações" title="Reivindicações">
      <nav aria-label="Filtro por situação" className="flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <Link
            key={t.key}
            href={`/admin/reivindicacoes?aba=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={`rounded-botao px-5 py-2.5 text-[14px] font-extrabold ${t.key === tab.key ? "bg-tinta text-papel" : "bg-campo"}`}
          >
            {t.label}{lists ? ` (${lists[i]?.length ?? 0})` : ""}
          </Link>
        ))}
      </nav>
      {lists === null ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar a fila. <Link href={`/admin/reivindicacoes?aba=${tab.key}`} className="underline">Tentar de novo</Link>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-texto-2 rounded-[24px] bg-white p-8 text-[15px] font-bold">Nenhuma reivindicação nesta aba.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((r) => <ClaimQueueCard key={r.id} row={r} />)}
        </div>
      )}
    </AdminShell>
  );
}
