import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { formatDate } from "@/features/claims/format";
import { METHOD_LABEL } from "@/features/claims/messages";
import type { QueueRow } from "@/features/claims/types";

import { ClaimStatusBadge } from "./ClaimStatusBadge";

/** Situação do canal de token; documentos não têm canal. */
export function channelLine(row: Pick<QueueRow, "method" | "channelConfirmedAt">): string {
  if (row.method === "documents") return "Sem canal de token (documentos)";
  return row.channelConfirmedAt ? `Canal confirmado em ${formatDate(row.channelConfirmedAt)}` : "Aguardando confirmação do canal";
}

/** Cartão da fila (Admin04). Sem contato da escola: só reivindicante, método e situação do canal. */
export function ClaimQueueCard({ row }: { row: QueueRow }) {
  const withAdmin = row.school.verificationStatus === "verified";
  const note = row.evidenceNote;
  return (
    <article className="flex flex-col gap-3 rounded-[24px] bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] leading-tight font-extrabold">
            <Link href={`/escolas/${row.school.inep}`} className="underline-offset-2 hover:underline">{row.school.name}</Link>
          </h2>
          <p className="text-texto-3 text-[12px] font-semibold">INEP {row.school.inep}</p>
          <p className="text-texto-3 mt-1 text-[12px] font-semibold">
            {row.claimantName} · {row.claimantRoleTitle} · {row.contactEmail} · {formatDate(row.submittedAt ?? row.createdAt)}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-botao px-2.5 py-1 text-[11px] font-extrabold ${withAdmin ? "bg-tinta text-white" : "bg-campo text-texto-2"}`}>
            {withAdmin ? "Escola com admin" : "Escola sem admin"}
          </span>
          {row.isDemo ? <DemoBadge /> : null}
        </span>
      </header>
      <p className="bg-papel rounded-campo px-4 py-3 text-[14px] leading-[1.4] font-semibold">
        {note ? `“${note}”` : <span className="text-texto-3">Sem evidência escrita.</span>}
      </p>
      <dl className="text-texto-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold">
        <div>{METHOD_LABEL[row.method]}</div>
        <div>{channelLine(row)}</div>
        <div>{row.evidenceCount} {row.evidenceCount === 1 ? "arquivo" : "arquivos"}</div>
        <div>{(note ?? "").length}/500</div>
      </dl>
      <footer className="flex items-center justify-between gap-3">
        <ClaimStatusBadge status={row.status} />
        <Link href={`/admin/reivindicacoes/${row.id}`} className="bg-tinta text-papel rounded-botao px-5 py-2.5 text-[14px] font-extrabold">
          Abrir e decidir
        </Link>
      </footer>
    </article>
  );
}
