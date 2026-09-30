import { formatBRL } from "@/features/cart/money";
import type { CatalogRow } from "@/features/stationeries/repository";

import { formatDateTime } from "./StatusPanel";

export const STOCK_LABEL: Record<CatalogRow["stock"], string> = {
  in_stock: "Tenho",
  out_of_stock: "Em falta",
  unknown: "Não informado",
};
const STOCK_TONE: Record<CatalogRow["stock"], string> = {
  in_stock: "bg-verde-certo/20 text-verde-fundo",
  out_of_stock: "bg-erro-fundo text-erro-texto",
  unknown: "bg-campo text-texto-2",
};
export const PRICE_SOURCE_LABEL = "Informado pela papelaria";

/** Lista do catálogo (Pap04), em cartões: a tabela de 5 colunas escondia "Editar" fora da tela a 390 px. Data = `price_updated_at`: muda só quando o preço muda. */
export function CatalogTable({ rows, editHref }: { rows: readonly CatalogRow[]; editHref: (id: string) => string }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card bg-white p-8 text-center text-[15px] font-bold" data-testid="catalog-empty">
        Nenhum item no catálogo ainda. Cadastre um item ou importe uma planilha.
      </p>
    );
  }
  return (
    <ul className="divide-linha rounded-card flex flex-col divide-y bg-white" aria-label="Itens do catálogo">
      {rows.map((r) => (
        <li key={r.id} className="flex min-w-0 flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-bold break-words">{r.name}</p>
            <p className="text-texto-2 text-[13px]">
              {PRICE_SOURCE_LABEL} · {formatDateTime(r.priceUpdatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:shrink-0">
            <span className="text-[15px] font-extrabold">{formatBRL(r.priceCents)}</span>
            <span className={`rounded-botao px-3 py-1 text-[12px] font-extrabold ${STOCK_TONE[r.stock]}`}>{STOCK_LABEL[r.stock]}</span>
            <a href={editHref(r.id)} aria-label={`Editar ${r.name}`} className="text-verde-fundo focus-visible:outline-verde-fundo inline-flex min-h-11 min-w-11 items-center font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2">Editar</a>
          </div>
        </li>
      ))}
    </ul>
  );
}
