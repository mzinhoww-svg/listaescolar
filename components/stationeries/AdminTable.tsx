import Link from "next/link";

import { formatCnpj } from "@/features/stationeries/cnpj";
import type { AdminListRow } from "@/features/stationeries/queries";
import { STATUS_LABEL } from "@/features/stationeries/messages";

import { formatDateTime } from "./StatusPanel";

type Props = { rows: readonly AdminListRow[]; approve: (fd: FormData) => Promise<void> };

/** Fila de papelarias (Admin09). CNPJ e WhatsApp só aqui, para a equipe; "Testado" não é afirmado: só o que consta no cadastro. */
export function AdminTable({ rows, approve }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card bg-white p-8 text-center text-[15px] font-bold" data-testid="admin-empty">
        Nenhuma papelaria neste filtro.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full min-w-[820px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Papelaria</th>
            <th scope="col" className="px-5 py-4">CNPJ</th>
            <th scope="col" className="px-5 py-4">Bairro</th>
            <th scope="col" className="px-5 py-4">WhatsApp</th>
            <th scope="col" className="px-5 py-4">Status</th>
            <th scope="col" className="px-5 py-4">Enviada</th>
            <th scope="col" className="px-5 py-4"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">
                {r.tradeName}
                {r.isDemo ? <span className="bg-campo ml-2 rounded-botao px-2 py-0.5 text-[11px]">Demonstração</span> : null}
              </th>
              <td className="px-5 py-3.5 font-bold whitespace-nowrap">{formatCnpj(r.cnpj)}</td>
              <td className="px-5 py-3.5 font-bold">{r.neighborhood ?? "indisponível"}</td>
              <td className="px-5 py-3.5">
                <span className="bg-campo rounded-botao px-3 py-1 text-[12px] font-extrabold">{r.whatsapp ? "Informado" : "Não informado"}</span>
              </td>
              <td className="px-5 py-3.5 font-bold">{STATUS_LABEL[r.status]}</td>
              <td className="px-5 py-3.5 font-bold">{formatDateTime(r.createdAt)}</td>
              <td className="flex items-center justify-end gap-2 px-5 py-3.5">
                <Link href={`/admin/papelarias/${r.id}`} className="border-tinta rounded-botao border-[1.5px] px-4 py-2 text-[13px] font-extrabold">
                  {r.status === "under_review" ? "Recusar" : "Abrir"}
                </Link>
                {r.status === "under_review" ? (
                  <form action={approve}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="to" value="approved" />
                    <input type="hidden" name="back" value="list" />
                    <button type="submit" className="bg-tinta text-papel rounded-botao px-4 py-2 text-[13px] font-extrabold">Aprovar</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
