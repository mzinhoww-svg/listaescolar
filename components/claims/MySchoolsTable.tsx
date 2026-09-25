import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { formatDate } from "@/features/claims/format";
import { STATUS_LABEL } from "@/features/claims/messages";
import type { MyClaimRow, MySchoolRow } from "@/features/claims/queries-mine";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const chip = "rounded-botao inline-flex w-fit px-2.5 py-1 text-[11px] font-extrabold";
const link = "text-verde-fundo text-[14px] font-extrabold";

function Cell({ name, inep, demo }: { name: string; inep: string; demo: boolean }) {
  return (
    <>
      <td className="px-5 py-4">
        <span className="flex items-center gap-3 text-[15px] font-bold">
          <span className="bg-tinta text-papel grid size-9 shrink-0 place-items-center rounded-[10px] text-[11px] font-extrabold">{initials(name)}</span>
          {name}
          {demo ? <DemoBadge /> : null}
        </span>
      </td>
      <td className="px-5 py-4 text-[14px] font-bold">{inep}</td>
    </>
  );
}

/** Escola03: escolas do usuário (vínculo real) e reivindicações abertas/recusadas. Sem contagem de listas (sem fonte aqui). */
export function MySchoolsTable({ schools, claims }: { schools: MySchoolRow[]; claims: MyClaimRow[] }) {
  if (schools.length === 0 && claims.length === 0) {
    return (
      <div className="rounded-[24px] bg-white p-8">
        <p className="text-[17px] font-extrabold">Você ainda não administra nenhuma escola.</p>
        <p className="text-texto-2 mt-1 text-[14px] font-medium">Busque a escola e envie um pedido de reivindicação.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[24px] bg-white">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[11px] font-extrabold tracking-[0.1em] uppercase">
            <th className="px-5 py-4">Escola</th>
            <th className="px-5 py-4">INEP</th>
            <th className="px-5 py-4">Situação</th>
            <th className="px-5 py-4"><span className="sr-only">Ação</span></th>
          </tr>
        </thead>
        <tbody>
          {schools.map((s) => (
            <tr key={s.schoolId} className="border-linha border-b last:border-0">
              <Cell name={s.name} inep={s.inep} demo={s.isDemo} />
              <td className="px-5 py-4">
                <span className={`${chip} ${s.verificationStatus === "verified" ? "bg-verde-certo/20 text-verde-fundo" : s.verificationStatus === "suspended" ? "bg-campo text-texto-2" : "bg-aviso-fundo text-aviso-texto"}`}>
                  {s.verificationStatus === "verified" ? "Verificada" : s.verificationStatus === "suspended" ? "Suspensa" : "Cadastrada"}
                </span>
              </td>
              <td className="px-5 py-4"><Link href={`/escolas/${s.inep}`} className={link}>Abrir página pública</Link></td>
            </tr>
          ))}
          {claims.map((c) => (
            <tr key={c.id} className="border-linha border-b last:border-0">
              <Cell name={c.school.name} inep={c.school.inep} demo={c.isDemo} />
              <td className="px-5 py-4">
                <span className={`${chip} ${c.status === "rejected" ? "bg-erro-fundo text-erro-texto" : "bg-aviso-fundo text-aviso-texto"}`}>{STATUS_LABEL[c.status]}</span>
                <span className="text-texto-3 mt-1 block text-[12px] font-semibold">
                  {c.status === "rejected" && c.decisionReason ? `Motivo: ${c.decisionReason}` : `Enviada em ${formatDate(c.createdAt)}`}
                </span>
              </td>
              <td className="px-5 py-4">
                <Link href={`/escolas/${c.school.inep}/reivindicar`} className={link}>{c.status === "rejected" ? "Ver e reivindicar de novo" : "Ver status"}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
