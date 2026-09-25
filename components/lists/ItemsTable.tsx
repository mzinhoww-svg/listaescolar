import type { PublicListItem } from "@/features/lists/types";

import { formatQuantity } from "./format";

/** Itens da versão atual: nome, quantidade/unidade e categoria. Nada além do que a lista publicada informa. */
export function ItemsTable({ items }: { items: PublicListItem[] }) {
  return (
    <section aria-labelledby="itens" className="flex flex-col gap-3">
      <h2 id="itens" className="text-base font-extrabold">
        Itens da lista
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const qty = formatQuantity(item.quantity, item.unit);
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="text-[15px] leading-[1.3] font-bold">{item.name}</p>
                {item.category ? (
                  <p className="text-texto-3 mt-0.5 text-xs font-semibold">{item.category}</p>
                ) : null}
              </div>
              <p className="text-texto-2 shrink-0 text-[13px] font-extrabold">
                {qty ?? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">quantidade não informada</span>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-texto-3 text-xs font-medium">
        Preço e estoque: indisponível (sem fonte nesta lista).
      </p>
    </section>
  );
}
