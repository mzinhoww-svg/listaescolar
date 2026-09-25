import { formatBRL } from "@/features/cart/money";
import type { CatalogRow } from "@/features/stationeries/repository";

import { formatDateTime } from "./StatusPanel";

export const STOCK_LABEL: Record<CatalogRow["stock"], string> = {
  in_stock: "Tenho",
  out_of_stock: "Em falta",
  unknown: "Não informado",
};
const STOCK_TONE: Record<CatalogRow["stock"], string> = {
  in_stock: "bg-[#d6f3e5] text-verde-fundo",
  out_of_stock: "bg-[#fde2e0] text-[#8a1c14]",
  unknown: "bg-campo text-texto-2",
};
export const PRICE_SOURCE_LABEL = "Informado pela papelaria";

/** Tabela do catálogo (Pap04). Data = `price_updated_at`: muda só quando o preço muda. */
export function CatalogTable({ rows, editHref }: { rows: readonly CatalogRow[]; editHref: (id: string) => string }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card bg-white p-8 text-center text-[15px] font-bold" data-testid="catalog-empty">
        Nenhum item no catálogo ainda. Cadastre um item ou importe uma planilha.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card bg-white">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] tracking-[0.08em] uppercase">
            <th scope="col" className="px-5 py-4">Item</th>
            <th scope="col" className="px-5 py-4">Preço</th>
            <th scope="col" className="px-5 py-4">Origem e data</th>
            <th scope="col" className="px-5 py-4">Estoque informado</th>
            <th scope="col" className="px-5 py-4"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-linha border-b last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-bold">{r.name}</th>
              <td className="px-5 py-3.5 font-extrabold">{formatBRL(r.priceCents)}</td>
              <td className="text-texto-2 px-5 py-3.5">
                {PRICE_SOURCE_LABEL} · {formatDateTime(r.priceUpdatedAt)}
              </td>
              <td className="px-5 py-3.5">
                <span className={`rounded-botao px-3 py-1 text-[12px] font-extrabold ${STOCK_TONE[r.stock]}`}>{STOCK_LABEL[r.stock]}</span>
              </td>
              <td className="px-5 py-3.5">
                <a href={editHref(r.id)} className="text-verde-fundo font-extrabold">Editar</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
