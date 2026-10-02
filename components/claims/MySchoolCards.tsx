import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";

import type { SchoolRowView } from "./my-school-rows";

/** Celular (< 768 px): um cartão por escola, com situação, "Próximo passo" e a ação; sem tabela de 640 px. */
export function MySchoolCards({ rows }: { rows: readonly SchoolRowView[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" aria-label="Minhas escolas">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-2 rounded-[24px] bg-white p-5">
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-extrabold">
            {r.name}
            {r.demo ? <DemoBadge /> : null}
          </p>
          <p className="text-texto-3 text-[13px] font-semibold">INEP {r.inep}</p>
          <span className={`rounded-botao inline-flex w-fit px-2.5 py-1 text-[12px] font-extrabold ${r.chipClass}`}>{r.chipText}</span>
          {r.note ? <p className="text-texto-3 text-[12px] font-semibold">{r.note}</p> : null}
          <p className="text-[13px] font-extrabold">Próximo passo: {r.step.title}</p>
          <p className="text-texto-2 text-[13px] font-semibold">{r.step.body}</p>
          <Link
            href={r.href}
            className="bg-tinta text-papel rounded-botao focus-visible:outline-verde-fundo mt-1 flex h-12 items-center justify-center px-4 text-center text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {r.cta}
          </Link>
        </li>
      ))}
    </ul>
  );
}
