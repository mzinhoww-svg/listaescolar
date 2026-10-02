import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import type { MyClaimRow, MySchoolRow } from "@/features/claims/queries-mine";

import { MySchoolCards } from "./MySchoolCards";
import { buildSchoolRows } from "./my-school-rows";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const chip = "rounded-botao inline-flex w-fit px-2.5 py-1 text-[12px] font-extrabold";
const link = "text-verde-fundo focus-visible:outline-verde-fundo inline-flex min-h-11 items-center text-[14px] font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2";

/** Escola03: escolas do usuário (vínculo real) e reivindicações abertas/recusadas. Sem contagem de listas (sem fonte aqui). Tabela a partir de 768 px; cartões no celular. */
export function MySchoolsTable({ schools, claims, withList = new Set() }: { schools: MySchoolRow[]; claims: MyClaimRow[]; withList?: ReadonlySet<string> }) {
  if (schools.length === 0 && claims.length === 0) {
    return (
      <div className="rounded-[24px] bg-white p-8">
        <p className="text-[17px] font-extrabold">Você ainda não administra nenhuma escola.</p>
        <p className="text-texto-2 mt-1 text-[14px] font-medium">Busque a escola e envie um pedido para administrar a página.</p>
      </div>
    );
  }
  const rows = buildSchoolRows(schools, claims, withList);
  return (
    <>
      <MySchoolCards rows={rows} />
      <div className="hidden overflow-x-auto rounded-[24px] bg-white md:block" tabIndex={0} role="region" aria-label="Tabela (role para o lado para ver todas as colunas)">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="text-texto-3 border-linha border-b text-[12px] font-extrabold tracking-[0.1em] uppercase">
              <th className="px-5 py-4">Escola</th>
              <th className="px-5 py-4">INEP</th>
              <th className="px-5 py-4">Situação</th>
              <th className="px-5 py-4"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-linha border-b last:border-0">
                <td className="px-5 py-4">
                  <span className="flex items-center gap-3 text-[15px] font-bold">
                    <span className="bg-tinta text-papel grid size-9 shrink-0 place-items-center rounded-[10px] text-[12px] font-extrabold">{initials(r.name)}</span>
                    {r.name}
                    {r.demo ? <DemoBadge /> : null}
                  </span>
                </td>
                <td className="px-5 py-4 text-[14px] font-bold">{r.inep}</td>
                <td className="px-5 py-4">
                  <span className={`${chip} ${r.chipClass}`}>{r.chipText}</span>
                  {r.note ? <span className="text-texto-3 mt-1 block text-[12px] font-semibold">{r.note}</span> : null}
                  <span className="mt-2 block max-w-[280px]">
                    <span className="block text-[13px] font-extrabold">Próximo passo: {r.step.title}</span>
                    <span className="text-texto-2 block text-[13px] font-semibold">{r.step.body}</span>
                  </span>
                </td>
                <td className="px-5 py-4">
                  <Link href={r.href} className={link}>{r.cta}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
