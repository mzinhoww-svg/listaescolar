import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { CountCard } from "@/components/admin/CountCard";
import type { UploadTotals } from "@/features/schools/upload-schema";

type BatchStatus = "pending" | "processing" | "completed" | "failed";
type Props = {
  batchId: string;
  alreadyExisted: boolean;
  resumed: boolean;
  isDemo: boolean;
  batchStatus: BatchStatus;
  totals: UploadTotals;
  onRetry?: () => void;
};

const TITLE: Record<BatchStatus, string> = {
  completed: "Importação concluída",
  failed: "Importação falhou",
  processing: "Importação em processamento",
  pending: "Importação em processamento",
};
const NOTE: Partial<Record<BatchStatus, string>> = {
  failed: "O lote parou no meio. As linhas já gravadas ficam salvas; tentar novamente retoma de onde parou.",
  processing: "Este arquivo está sendo importado em outro envio. Os números abaixo são parciais; recarregue depois.",
  pending: "Este arquivo está sendo importado em outro envio. Os números abaixo são parciais; recarregue depois.",
};

export function ImportResult({ batchId, alreadyExisted, resumed, isDemo, batchStatus, totals, onRetry }: Props) {
  const failed = batchStatus === "failed";
  return (
    <section aria-label="Resultado da importação" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">{TITLE[batchStatus]}</h2>
        {isDemo ? <DemoBadge /> : null}
        {resumed ? (
          <span role="status" className="rounded-botao bg-amber-100 px-3 py-0.5 text-sm font-extrabold text-amber-900">
            Importação retomada
          </span>
        ) : alreadyExisted && batchStatus === "completed" ? (
          <span role="status" className="rounded-botao bg-amber-100 px-3 py-0.5 text-sm font-extrabold text-amber-900">
            Arquivo já importado
          </span>
        ) : null}
      </div>
      {NOTE[batchStatus] ? <p className="text-texto-2 text-[15px]">{NOTE[batchStatus]}</p> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <CountCard label="Inseridas" value={totals.inserted} />
        <CountCard label="Atualizadas" value={totals.updated} />
        <CountCard label="Sem alteração" value={totals.unchanged} />
        <CountCard label="Duplicadas" value={totals.duplicate} />
        <CountCard label="Rejeitadas" value={totals.rejected} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {failed && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-botao border-tinta border-[1.5px] px-4 py-1.5 text-sm font-extrabold"
          >
            Tentar novamente
          </button>
        ) : null}
        <Link href={`/admin/importacoes/${batchId}`} className="text-verde-fundo w-fit text-[15px] font-extrabold underline">
          Ver detalhes do lote
        </Link>
      </div>
    </section>
  );
}
