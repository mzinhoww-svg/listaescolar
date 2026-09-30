import type { PublicListItem } from "@/features/lists/types";

import { formatQuantity } from "./format";

/** D-034 (S18): item sem categoria (o campo é opcional) entra neste grupo, sempre por último. */
const UNCATEGORIZED = "Outros itens";

type Group = { category: string; items: PublicListItem[] };

/** Agrupa preservando a ordem de primeira aparição da categoria na lista (nunca reordena por alfabeto). */
function groupByCategory(items: readonly PublicListItem[]): Group[] {
  const order: string[] = [];
  const byCategory = new Map<string, PublicListItem[]>();
  for (const item of items) {
    const key = item.category ?? UNCATEGORIZED;
    let bucket = byCategory.get(key);
    if (!bucket) {
      bucket = [];
      byCategory.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }
  // "Outros itens" sempre por último, mesmo que apareça antes de uma categoria nomeada na lista.
  const named = order.filter((c) => c !== UNCATEGORIZED);
  const rest = order.includes(UNCATEGORIZED) ? [UNCATEGORIZED] : [];
  return [...named, ...rest].map((category) => ({ category, items: byCategory.get(category) ?? [] }));
}

/** Itens da versão atual, agrupados por categoria (App05). Nada além do que a lista publicada informa. */
export function ItemsTable({ items }: { items: PublicListItem[] }) {
  const groups = groupByCategory(items);
  return (
    <section aria-labelledby="itens" className="flex flex-col gap-4">
      <h2 id="itens" className="text-base font-extrabold">
        Itens da lista
      </h2>
      {groups.map((group) => (
        <div key={group.category} className="flex flex-col gap-1.5">
          <h3 className="text-texto-2 text-[13px] font-extrabold">{group.category}</h3>
          <ul className="divide-linha flex flex-col divide-y rounded-[22px] bg-white px-4">
            {group.items.map((item) => {
              const qty = formatQuantity(item.quantity, item.unit);
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3.5">
                  <p className="min-w-0 text-[15px] leading-[1.3] font-bold [overflow-wrap:anywhere]">{item.name}</p>
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
        </div>
      ))}
      <p className="text-texto-3 text-xs font-medium">
        Preço e estoque: indisponível (sem fonte nesta lista).
      </p>
    </section>
  );
}
