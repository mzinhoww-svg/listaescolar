import type { CartItemRow } from "@/features/cart/repository";

export function ItemsList({ items }: { items: CartItemRow[] }) {
  return (
    <details className="bg-branco-tonal rounded-[24px] p-4">
      <summary className="cursor-pointer text-[15px] font-extrabold">
        Itens da lista ({items.length})
      </summary>
      <ul className="divide-linha mt-2 divide-y">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 py-2 text-sm font-semibold">
            <span>{i.name}</span>
            <span className="text-texto-3">× {i.quantity}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
