import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { reasonPhrase } from "@/features/review/phrases";
import { SCHOOL_LABEL_UNAVAILABLE, type SchoolLabel } from "@/features/review/school-labels";
import type { QueueRow } from "@/features/review/read-models";

import { formatWhen } from "./format";

const STATE_TEXT = { awaiting_publication: "Aguardando publicação", published: "Publicada" } as const;

/** Fila (Admin05). Só origem e data: nome e e-mail de quem enviou nunca chegam aqui. Textos vêm de frases fixas. */
export function ReviewQueueTable({ rows, labels, demoPublication = false }: { rows: readonly QueueRow[]; labels: Readonly<Record<string, SchoolLabel>>; demoPublication?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[24px] bg-white p-2">
      <table className="w-full min-w-[860px] text-left text-[14px]">
        <caption className="sr-only">Listas enviadas para revisão, da mais antiga para a mais recente</caption>
        <thead>
          <tr className="text-texto-3 text-[12px] tracking-[0.06em] uppercase">
            {["Escola · série", "Ano", "Origem", "Itens", "Enviada em", "Motivos", ""].map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 font-extrabold">{h || <span className="sr-only">Ação</span>}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const school = (r.schoolId ? labels[r.schoolId]?.name : null) ?? SCHOOL_LABEL_UNAVAILABLE;
            const shown = r.reasons.slice(0, 2);
            return (
              <tr key={r.id} className="border-campo border-t align-top">
                <td className="px-3 py-3 font-bold">
                  {school} · {r.grade ?? "série não informada"}
                  {r.isDemo ? <span className="ml-2"><DemoBadge /></span> : null}
                  {r.state ? <span className="bg-campo mt-1 block w-fit rounded-botao px-2.5 py-0.5 text-xs font-extrabold">{STATE_TEXT[r.state]}</span> : null}
                  {r.state === "published" && demoPublication && !r.isDemo ? <span className="mt-1 block w-fit"><DemoBadge /></span> : null}
                </td>
                <td className="px-3 py-3">{r.schoolYear ?? "indisponível"}</td>
                <td className="px-3 py-3">{r.source === "parent" ? "Família" : "Escola"}</td>
                <td className="px-3 py-3">{r.itemCount ?? "indisponível"}</td>
                <td className="px-3 py-3">{formatWhen(r.createdAt)}</td>
                <td className="px-3 py-3">
                  {shown.length === 0 ? <span className="text-texto-3">Sem motivos registrados</span> : (
                    <ul className="flex flex-col gap-1">
                      {shown.map((c) => <li key={c}>{reasonPhrase(c)}</li>)}
                      {r.reasons.length > 2 ? <li className="text-texto-3 font-bold">+{r.reasons.length - 2}</li> : null}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/admin/revisao/${r.id}`} className="text-verde-fundo inline-flex min-h-11 items-center font-extrabold underline">
                    Abrir<span className="sr-only"> revisão de {school}, {r.grade ?? "série não informada"}</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
