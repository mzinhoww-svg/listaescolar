import { formatBrl } from "@/features/billing/money";
import { confirmSaleAction } from "@/features/payouts/actions";
import type { SalePaymentView } from "@/features/payouts/ports";

type Props = {
  leadId: string;
  declaredSaleCents: number | null;
  sale: SalePaymentView | null;
  back: string;
};

/**
 * Pap03: a papelaria registra que esta venda foi paga por Pix rastreado pela plataforma. Puramente declarativo —
 * não cobra nem transfere nada; só gera a COMISSÃO da plataforma no livro-razão (Admin13).
 * Revisão de segurança (S23): sem seletor de escola aqui de propósito — uma confirmação da própria papelaria NUNCA
 * cria repasse para escola/APM (mesmo que ela escolhesse uma no formulário, o banco ignoraria), só a comissão dela;
 * repasse exige a confirmação do ADMIN (Admin13, "Vendas para confirmar"), que valida a escola antes.
 */
export function ConfirmSaleForm({ leadId, declaredSaleCents, sale, back }: Props) {
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
        Se a família pagou por um Pix rastreado pela ListaCerta (não pelo seu Pix direto), confirme aqui. Isso não move
        dinheiro nenhum: só registra a venda para a comissão da plataforma.
      </p>
      <form action={confirmSaleAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="back" value={back} />
        <button type="submit" className="border-tinta text-tinta rounded-botao h-11 border-[1.5px] px-4 text-[13px] font-extrabold">
          Confirmar Pix pela plataforma ({formatBrl(declaredSaleCents)})
        </button>
      </form>
    </section>
  );
}
