import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { DemoSeal } from "@/components/leads/StatusBadge";
import type { CartSummaryRow } from "@/features/cart/repository";
import { cartDate, cartTitle, type CartLabel } from "@/features/cart/title";

const PREVIEW = 3;

/** App16-HubPais "Carrinhos" (S15): carrinhos recentes da família, nomeados por escola, série e data. */
export function CartsSection({ carts, labels = {} }: { carts: readonly CartSummaryRow[]; labels?: Record<string, CartLabel> }) {
  const shown = carts.slice(0, PREVIEW);
  return (
    <section aria-label="Seus carrinhos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Seus carrinhos</h2>
        {carts.length > 0 ? (
          <Link href="/conta/carrinhos" className={buttonClass("text")}>
            Ver todos
          </Link>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-start">
          <p className="text-texto-2 text-[14px] font-semibold">Nenhum carrinho ainda. Abra uma lista publicada e toque em Montar carrinho.</p>
          <Link href="/escolas" className={buttonClass("text", "md", "-ml-2")}>
            Buscar a escola
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Carrinhos recentes">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/carrinho/${c.id}`} className="bg-branco-tonal flex min-h-11 items-center justify-between gap-2 rounded-[20px] p-4">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[14px] font-extrabold break-words">{cartTitle(c.listId ? (labels[c.listId] ?? null) : null, c.createdAt)}</span>
                  <span className="text-texto-2 text-[13px] font-semibold">
                    {c.itemCount} {c.itemCount === 1 ? "item" : "itens"} · {cartDate(c.createdAt)}
                  </span>
                </span>
                {c.isDemo ? <DemoSeal /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
