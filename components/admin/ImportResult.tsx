import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { CountCard } from "@/components/admin/CountCard";
import type { UploadTotals } from "@/features/schools/upload-schema";

type Props = { batchId: string; alreadyExisted: boolean; isDemo: boolean; totals: UploadTotals };

export function ImportResult({ batchId, alreadyExisted, isDemo, totals }: Props) {
  return (
    <section aria-label="Resultado da importação" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">Importação concluída</h2>
        {isDemo ? <DemoBadge /> : null}
        {alreadyExisted ? (
          <span role="status" className="rounded-botao bg-amber-100 px-3 py-0.5 text-sm font-extrabold text-amber-900">
            Arquivo já importado
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <CountCard label="Inseridas" value={totals.inserted} />
        <CountCard label="Atualizadas" value={totals.updated} />
        <CountCard label="Sem alteração" value={totals.unchanged} />
        <CountCard label="Duplicadas" value={totals.duplicate} />
        <CountCard label="Rejeitadas" value={totals.rejected} />
      </div>
      <Link href={`/admin/importacoes/${batchId}`} className="text-verde-fundo w-fit text-[15px] font-extrabold underline">
        Ver detalhes do lote
      </Link>
    </section>
  );
}
