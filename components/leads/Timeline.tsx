import type { LeadEventRow } from "@/features/leads/repository";

import { eventLabel, formatWhen } from "./format";

/** Linha do tempo só com eventos reais do banco. */
export function Timeline({ events, side }: { events: readonly LeadEventRow[]; side: "stationery" | "requester" }) {
  return (
    <section className="rounded-card bg-white p-5" aria-label="Linha do tempo">
      <h2 className="mb-3 text-[16px] font-extrabold">Linha do tempo</h2>
      {events.length === 0 ? (
        <p className="text-texto-3 text-[14px] font-semibold">Nenhum evento registrado.</p>
      ) : (
        <ol className="flex flex-col gap-2.5" data-testid="timeline">
          {events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 text-[14px]">
              <span className="flex items-start gap-2 font-bold">
                <span aria-hidden className="bg-verde-certo mt-1.5 size-2.5 shrink-0 rounded-full" />
                {eventLabel(e, side)}
              </span>
              <time dateTime={e.createdAt.toISOString()} className="text-texto-3 text-[12px] font-semibold whitespace-nowrap">
                {formatWhen(e.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
