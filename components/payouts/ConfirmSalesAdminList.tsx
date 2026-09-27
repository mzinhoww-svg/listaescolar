import { formatBrl } from "@/features/billing/money";
import { confirmSaleAction } from "@/features/payouts/actions";

type ConfirmableSale = { leadId: string; leadCode: string; stationeryName: string; amountCents: number; schoolNameHint: string; awaitingValidation: boolean };
type SchoolOption = { id: string; name: string };

/**
 * Admin13 ("Vendas para confirmar"): único caminho que gera REPASSE (revisão de segurança, S23) — a confirmação da
 * própria papelaria (Pap03) nunca cria repasse, só comissão. Aqui o admin escolhe a escola (ou deixa em branco,
 * gerando só comissão) antes de confirmar.
 *
 * `awaitingValidation` (correção funcional, rodada 2 da revisão): a papelaria já confirmou esta venda sozinha —
 * ela NÃO desaparece mais desta fila até o admin validar (mesmo formulário/ação, `payout_admin_validate_sale` do
 * lado do banco decide sozinho se é uma confirmação nova ou uma validação, sem duplicar a comissão já apurada).
 */
export function ConfirmSalesAdminList({ sales, schools }: { sales: readonly ConfirmableSale[]; schools: readonly SchoolOption[] }) {
  return (
    <section className="rounded-card flex flex-col gap-3 bg-white p-6">
      <h2 className="text-[16px] font-extrabold">Vendas para confirmar</h2>
      <p className="text-texto-2 text-[13px] font-semibold">
        Confirme aqui (com a escola certa) as vendas que devem gerar repasse. A papelaria também pode confirmar pelo
        próprio painel, mas isso gera só a comissão da plataforma, nunca repasse — por isso vendas já confirmadas só
        pela papelaria continuam aqui, aguardando a validação do admin.
      </p>
      {sales.length === 0 ? (
        <p className="text-texto-3 text-[14px] font-semibold">Nenhuma venda aguardando confirmação.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sales.map((s) => (
            <li key={s.leadId} className="bg-campo rounded-campo flex flex-wrap items-end justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[14px] font-extrabold">{s.leadCode} · {s.stationeryName} · {formatBrl(s.amountCents)}</p>
                <p className="text-texto-3 text-[13px] font-semibold">Escola informada pela papelaria: {s.schoolNameHint}</p>
                {s.awaitingValidation ? (
                  <p className="text-verde-fundo text-[12px] font-extrabold uppercase">Confirmada pela papelaria · aguardando validação</p>
                ) : null}
              </div>
              <form action={confirmSaleAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="leadId" value={s.leadId} />
                <input type="hidden" name="back" value="/admin/repasses" />
                <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
                  Escola (repasse)
                  <select name="schoolId" defaultValue="" className="bg-white h-10 rounded-campo border border-linha px-3 text-[13px] font-bold normal-case">
                    <option value="">Sem repasse (só comissão)</option>
                    {schools.map((sc) => (
                      <option key={sc.id} value={sc.id}>{sc.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="bg-tinta text-papel rounded-botao h-10 px-4 text-[13px] font-extrabold">
                  {s.awaitingValidation ? "Validar" : "Confirmar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
