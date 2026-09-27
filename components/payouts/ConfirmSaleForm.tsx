import { formatBrl } from "@/features/billing/money";
import { confirmSaleAction } from "@/features/payouts/actions";
import type { SalePaymentView } from "@/features/payouts/ports";

type Props = {
  leadId: string;
  declaredSaleCents: number | null;
  sale: SalePaymentView | null;
  back: string;
  schoolNameHint: string;
  schools: readonly { id: string; name: string }[];
};

/**
 * Pap03: registra que esta venda foi paga por Pix rastreado pela plataforma. Puramente declarativo — não cobra nem
 * transfere nada; só gera comissão/repasse no livro-razão do admin (Admin13).
 */
export function ConfirmSaleForm({ leadId, declaredSaleCents, sale, back, schoolNameHint, schools }: Props) {
  if (sale) {
    return (
      <section className="rounded-card bg-white p-5" aria-label="Pix pela plataforma">
        <p className="text-texto-3 text-[13px] font-bold">Pix pela plataforma</p>
        <p className="text-[15px] font-extrabold">Confirmado · {formatBrl(sale.amountCents)}</p>
      </section>
    );
  }
  if (declaredSaleCents === null) return null;
  return (
    <section className="rounded-card flex flex-col gap-2 bg-white p-5" aria-label="Pix pela plataforma">
      <p className="text-texto-3 text-[13px] font-bold">Pix pela plataforma</p>
      <p className="text-texto-2 text-[13px] font-semibold">
        Se o pai pagou por um Pix rastreado pela ListaCerta (não pelo seu Pix direto), confirme aqui. Isso não move
        dinheiro nenhum: só registra a venda para a comissão da plataforma.
      </p>
      <form action={confirmSaleAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="back" value={back} />
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Escola (opcional, para repasse)
          <select name="schoolId" defaultValue="" className="bg-campo h-10 rounded-campo px-3 text-[13px] font-bold normal-case">
            <option value="">Não identificada ({schoolNameHint})</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="border-tinta text-tinta rounded-botao h-10 border-[1.5px] px-4 text-[13px] font-extrabold">
          Confirmar Pix pela plataforma ({formatBrl(declaredSaleCents)})
        </button>
      </form>
    </section>
  );
}
