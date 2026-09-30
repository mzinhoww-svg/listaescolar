import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatCnpj } from "@/features/stationeries/cnpj";
import type { AdminListRow } from "@/features/stationeries/queries";
import { STATUS_LABEL } from "@/features/stationeries/messages";

import { formatDateTime } from "./StatusPanel";

type Props = { rows: readonly AdminListRow[]; approve: (fd: FormData) => Promise<void> };

/** Fila de papelarias (Admin09). CNPJ e WhatsApp só aqui, para a equipe; "Testado" não é afirmado: só o que consta no cadastro. */
export function AdminTable({ rows, approve }: Props) {
  if (rows.length === 0) {
    return (
      <p
        className="rounded-card bg-white p-8 text-center text-[15px] font-bold"
        data-testid="admin-empty"
      >
        Nenhuma papelaria neste filtro.
      </p>
    );
  }
  return (
    <div
      className="rounded-card overflow-x-auto bg-white"
      tabIndex={0}
      role="region"
      aria-label="Tabela (role para o lado para ver todas as colunas)"
    >
      <table className="w-full min-w-[820px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">
              Papelaria
            </th>
            <th scope="col" className="px-5 py-4">
              CNPJ
            </th>
            <th scope="col" className="px-5 py-4">
              Bairro
            </th>
            <th scope="col" className="px-5 py-4">
              WhatsApp
            </th>
            <th scope="col" className="px-5 py-4">
              Status
            </th>
            <th scope="col" className="px-5 py-4">
              Enviada
            </th>
            <th
              scope="col"
              className="sticky right-0 bg-white px-5 py-4 shadow-[-8px_0_8px_-8px_rgba(15,27,45,0.18)]"
            >
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-extrabold">
                <Link
                  href={`/admin/papelarias/${r.id}`}
                  className="inline-flex min-h-11 items-center underline"
                >
                  {r.tradeName}
                </Link>
                {r.isDemo ? (
                  <span className="bg-campo rounded-botao ml-2 px-2 py-0.5 text-[12px]">
                    Demonstração
                  </span>
                ) : null}
              </th>
              <td className="px-5 py-3.5 font-bold whitespace-nowrap">{formatCnpj(r.cnpj)}</td>
              <td className="px-5 py-3.5 font-bold">{r.neighborhood ?? "indisponível"}</td>
              <td className="px-5 py-3.5">
                <span className="bg-campo rounded-botao px-3 py-1 text-[12px] font-extrabold">
                  {r.whatsapp ? "Informado" : "Não informado"}
                </span>
              </td>
              <td className="px-5 py-3.5 font-bold">{STATUS_LABEL[r.status]}</td>
              <td className="px-5 py-3.5 font-bold">{formatDateTime(r.createdAt)}</td>
              <td
                className="sticky right-0 bg-white px-5 py-3.5 shadow-[-8px_0_8px_-8px_rgba(15,27,45,0.18)]"
                data-sticky-action
              >
                <div className="flex items-center justify-end gap-2">
                  {r.status === "under_review" ? (
                    <>
                      <ConfirmDialog
                        triggerLabel="Recusar"
                        triggerStyle="button"
                        triggerVariant="outline"
                        title={`Recusar ${r.tradeName}?`}
                        body={
                          <>
                            <p>
                              A papelaria fica recusada e não aparece para as famílias. O motivo é
                              mostrado a ela para corrigir e reenviar.
                            </p>
                            <label
                              className="mt-3 block text-[13px] font-extrabold"
                              htmlFor={`reason-${r.id}`}
                            >
                              Motivo (obrigatório)
                            </label>
                            <textarea
                              id={`reason-${r.id}`}
                              name="reason"
                              required
                              maxLength={500}
                              rows={3}
                              className="rounded-campo bg-campo mt-1 w-full p-3 text-[14px]"
                            />
                          </>
                        }
                        confirmLabel="Recusar papelaria"
                        action={approve}
                        hidden={{ id: r.id, to: "rejected", back: "list" }}
                      />
                      <ConfirmDialog
                        triggerLabel="Aprovar"
                        triggerStyle="button"
                        triggerVariant="primary"
                        confirmVariant="primary"
                        title={`Aprovar ${r.tradeName}?`}
                        body="Depois de aprovada, a papelaria passa a poder receber cotações quando ativar o cadastro. Você pode pausar ou suspender depois."
                        confirmLabel="Aprovar papelaria"
                        action={approve}
                        hidden={{ id: r.id, to: "approved", back: "list" }}
                      />
                    </>
                  ) : (
                    <Link href={`/admin/papelarias/${r.id}`} className={buttonClass("outline")}>
                      Abrir
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
