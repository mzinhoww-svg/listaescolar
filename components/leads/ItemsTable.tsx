import type { Estimate, StockLabel } from "@/features/leads/estimate";
import { formatBRL } from "@/features/cart/money";

import { formatWhen, moneyOrUnavailable } from "./format";

const TONE: Record<StockLabel, string> = {
  Tenho: "bg-verde-certo/20 text-verde-fundo",
  "Em falta": "bg-erro-fundo text-erro-texto",
  "não informado": "bg-campo text-texto-2",
};

/**
 * Itens do lead × catálogo da papelaria (Pap03). Preço só com origem e data; sem catálogo, "indisponível".
 * Lista de cartões em vez de tabela: a tabela de 4 colunas estourava 390 px (UX-075) e o nome longo empurrava o resto.
 */
export function ItemsTable({ estimate }: { estimate: Estimate }) {
  return (
    <section aria-label="Itens do pedido" className="rounded-card bg-white">
      <ul className="divide-linha flex flex-col divide-y">
        {estimate.lines.map((l) => (
          <li key={l.itemKey} className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3 text-[14px]">
              <span className="font-extrabold whitespace-nowrap">{l.quantity}×</span>
              <span className="min-w-0 break-words">{l.name}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[14px] sm:shrink-0 sm:justify-end">
              <span className="min-w-0">
                {l.unitPriceCents !== null && l.lineTotalCents !== null ? (
                  <>
                    <span className="text-texto-2 block text-[12px] font-semibold">{`${l.quantity} × ${formatBRL(l.unitPriceCents)}`}</span>
                    <span className="font-extrabold">{moneyOrUnavailable(l.lineTotalCents)}</span>
                  </>
                ) : (
                  <span className="font-extrabold">{moneyOrUnavailable(null)}</span>
                )}
                {l.priceUpdatedAt ? <span className="text-texto-3 block text-[12px]">informado em {formatWhen(l.priceUpdatedAt)}</span> : null}
              </span>
              <span className={`${TONE[l.stockLabel]} rounded-botao px-3 py-1 text-[12px] font-extrabold whitespace-nowrap`}>{l.stockLabel}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-linha flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t px-4 py-4">
        <p className="text-texto-2 min-w-0 font-bold">
          Total no seu catálogo
          {estimate.status === "partial" ? ` (${estimate.pricedCount} de ${estimate.totalCount} itens com preço)` : ""}
        </p>
        <p className="text-[18px] font-extrabold" data-testid="subtotal">
          {moneyOrUnavailable(estimate.subtotalCents)}
        </p>
      </div>
    </section>
  );
}
