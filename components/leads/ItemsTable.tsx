import type { Estimate, StockLabel } from "@/features/leads/estimate";

import { formatWhen, moneyOrUnavailable } from "./format";

const TONE: Record<StockLabel, string> = {
  Tenho: "bg-[#d6f3e5] text-verde-fundo",
  "Em falta": "bg-[#fde2e0] text-[#8a1c14]",
  "não informado": "bg-campo text-texto-2",
};

/** Itens do lead × catálogo da papelaria (Pap03). Preço só com origem e data; sem catálogo, "indisponível". */
export function ItemsTable({ estimate }: { estimate: Estimate }) {
  return (
    <div className="rounded-card overflow-hidden bg-white">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-4 py-3">Qtd</th>
            <th scope="col" className="px-4 py-3">Item</th>
            <th scope="col" className="px-4 py-3">Preço no seu catálogo</th>
            <th scope="col" className="px-4 py-3">Estoque</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lines.map((l) => (
            <tr key={l.itemKey} className="border-linha border-b last:border-0">
              <td className="px-4 py-3 font-extrabold">{l.quantity}</td>
              <td className="px-4 py-3">{l.name}</td>
              <td className="px-4 py-3">
                {moneyOrUnavailable(l.lineTotalCents)}
                {l.priceUpdatedAt ? <span className="text-texto-3 block text-[11px]">informado em {formatWhen(l.priceUpdatedAt)}</span> : null}
              </td>
              <td className="px-4 py-3">
                <span className={`${TONE[l.stockLabel]} rounded-botao px-3 py-1 text-[12px] font-extrabold whitespace-nowrap`}>{l.stockLabel}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2} className="text-texto-2 px-4 py-4 text-left font-bold">
              Subtotal pelo seu catálogo
              {estimate.status === "partial" ? ` (${estimate.pricedCount} de ${estimate.totalCount} itens com preço)` : ""}
            </th>
            <td colSpan={2} className="px-4 py-4 text-[18px] font-extrabold" data-testid="subtotal">
              {moneyOrUnavailable(estimate.subtotalCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
