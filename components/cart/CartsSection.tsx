import Link from "next/link";

import type { CartSummaryRow } from "@/features/cart/repository";

import { DemoSeal } from "@/components/leads/StatusBadge";
import { STRATEGY_LABEL } from "./format";

const PREVIEW = 3;

/** App16-HubPais "Carrinhos" (S15): carrinhos recentes da família, com status vindo do banco. */
export function CartsSection({ carts }: { carts: readonly CartSummaryRow[] }) {
  const shown = carts.slice(0, PREVIEW);
  return (
    <section aria-label="Seus carrinhos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Seus carrinhos</h2>
        {carts.length > 0 ? (
          <Link href="/conta/carrinhos" className="text-verde-fundo inline-flex min-h-11 items-center text-[13px] font-extrabold">
            Ver todos
          </Link>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="text-texto-2 text-[13px] font-semibold">
          Nenhum carrinho ainda. Abra uma lista publicada e toque em Montar carrinho.{" "}
          <Link href="/escolas" className="text-verde-fundo inline-flex min-h-11 items-center font-extrabold underline">
            Buscar a escola
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label="Carrinhos recentes">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/carrinho/${c.id}`} className="bg-branco-tonal flex items-center justify-between gap-2 rounded-[20px] p-4">
                <span className="flex flex-col">
                  <span className="text-[14px] font-extrabold">{STRATEGY_LABEL[c.strategy]}</span>
                  <span className="text-texto-2 text-[12px] font-semibold">
                    {c.itemCount} {c.itemCount === 1 ? "item" : "itens"}
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
