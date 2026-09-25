import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { StatusChip } from "@/components/admin/StatusChip";
import type { BatchListItem } from "@/features/schools/queries";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });
const TH = "text-texto-3 px-5 py-3 text-left text-xs font-extrabold tracking-[0.08em] uppercase";

export function BatchTable({ batches }: { batches: BatchListItem[] }) {
  if (batches.length === 0) {
    return (
      <div className="rounded-card bg-branco-tonal px-6 py-10 text-center">
        <p className="text-lg font-extrabold">Nenhuma importação ainda</p>
        <p className="text-texto-2 mt-1 text-[15px]">Envie um CSV do INEP acima para criar o primeiro lote.</p>
      </div>
    );
  }
  return (
    <div className="rounded-card bg-branco-tonal overflow-x-auto">
      <table className="w-full border-collapse text-[15px] whitespace-nowrap">
        <thead>
          <tr className="border-linha border-b">
            <th className={TH}>Arquivo e data</th>
            <th className={TH}>Status</th>
            <th className={TH}>Resultado</th>
            <th className={TH}>Erros</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-linha border-b last:border-b-0">
              <td className="px-5 py-4 font-semibold">
                <Link href={`/admin/importacoes/${b.id}`} className="underline">
                  {b.file_name}
                </Link>{" "}
                {b.is_demo ? <DemoBadge /> : null}
                <span className="text-texto-3 mt-0.5 block text-[13px] font-normal">
                  {dateFmt.format(new Date(b.created_at))}
                </span>
              </td>
              <td className="px-5 py-4">
                <StatusChip status={b.status} />
              </td>
              <td className="text-texto-2 px-5 py-4 text-[13px] leading-snug">
                <span className="block">
                  {b.total_rows} linhas · {b.inserted_count} inseridas · {b.updated_count} atualizadas
                </span>
                <span className="block">
                  {b.unchanged_count} sem alteração · {b.duplicate_count} duplicadas · {b.rejected_count} rejeitadas
                </span>
              </td>
              <td className="px-5 py-4">
                {b.rejected_count + b.duplicate_count + b.file_errors.length > 0 ? (
                  <a href={`/admin/importacoes/${b.id}/erros.csv`} className="text-verde-fundo font-extrabold underline">
                    Baixar erros
                  </a>
                ) : (
                  <span className="text-texto-3">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
