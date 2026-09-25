import Link from "next/link";

import type { StationeryLead } from "@/features/leads/repository";

import { moneyOrUnavailable, relativeWhen } from "./format";
import { DemoSeal, StatusBadge } from "./StatusBadge";

type Props = { rows: readonly StationeryLead[]; now: Date };

const detail = (code: string): string => `/papelaria/leads/${code}`;

/** Tabela (desktop). Valor "enviado" só quando a papelaria informou; sem estimativa aqui (o detalhe calcula do catálogo). */
export function LeadTable({ rows, now }: Props) {
  return (
    <div className="rounded-card hidden overflow-x-auto bg-white md:block">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Código</th>
            <th scope="col" className="px-5 py-4">Escola · série</th>
            <th scope="col" className="px-5 py-4">Itens</th>
            <th scope="col" className="px-5 py-4">Enviado (valor)</th>
            <th scope="col" className="px-5 py-4">Recebido</th>
            <th scope="col" className="px-5 py-4">Status</th>
            <th scope="col" className="px-5 py-4"><span className="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-0" data-testid="lead-row">
              <td className="px-5 py-3.5 font-extrabold whitespace-nowrap">{r.code}</td>
              <td className="px-5 py-3.5">
                {r.schoolName} · {r.gradeLabel} {r.isDemo ? <DemoSeal /> : null}
              </td>
              <td className="px-5 py-3.5">{r.itemCount}</td>
              <td className="px-5 py-3.5">{moneyOrUnavailable(r.quotedTotalCents)}</td>
              <td className="px-5 py-3.5">{relativeWhen(r.createdAt, now)}</td>
              <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
              <td className="px-5 py-3.5">
                <Link href={detail(r.code)} className="text-verde-fundo font-extrabold" aria-label={`Abrir ${r.code}`}>Abrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
