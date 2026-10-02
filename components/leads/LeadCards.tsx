import Link from "next/link";

import type { StationeryLead } from "@/features/leads/repository";

import { moneyOrUnavailable, relativeWhen } from "./format";
import { DemoSeal, StatusBadge } from "./StatusBadge";

/** Cartões (mobile, Pap02m). */
export function LeadCards({ rows, now }: { rows: readonly StationeryLead[]; now: Date }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" aria-label="Leads">
      {rows.map((r) => (
        <li key={r.id} className="rounded-card flex flex-col gap-2 bg-white p-4" data-testid="lead-card">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[16px] font-extrabold">{r.code}</p>
            <StatusBadge status={r.status} />
          </div>
          <p className="text-[14px] font-semibold">
            {r.schoolName} · {r.gradeLabel}
          </p>
          <p className="text-texto-3 text-[12px] font-semibold">
            {r.itemCount} itens · enviado {moneyOrUnavailable(r.quotedTotalCents)} · {relativeWhen(r.createdAt, now)}
          </p>
          {r.isDemo ? <DemoSeal /> : null}
          <Link
            href={`/papelaria/leads/${r.code}`}
            className="bg-tinta text-papel rounded-botao mt-1 flex h-12 items-center justify-center text-[15px] font-extrabold"
            aria-label={`Abrir ${r.code} (cartão)`}
          >
            Abrir e responder o pedido
          </Link>
        </li>
      ))}
    </ul>
  );
}
