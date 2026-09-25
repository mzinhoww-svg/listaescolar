"use client";

import { boughtKey, useBought, writeBought } from "./bought-store";

export function BoughtToggle({
  cartId,
  slug,
  name,
}: {
  cartId: string;
  slug: string;
  name: string;
}) {
  const bought = useBought(boughtKey(cartId, slug));
  return (
    <button
      type="button"
      aria-pressed={bought}
      onClick={() => writeBought(boughtKey(cartId, slug), !bought)}
      className={`${bought ? "bg-verde-certo text-tinta" : "bg-campo text-texto-2"} rounded-botao flex h-9 w-full items-center justify-center text-[13px] font-extrabold`}
    >
      {bought ? <span aria-hidden="true">✓ </span> : null}
      Já comprei em {name}
    </button>
  );
}

export function BoughtAll({ cartId, slugs }: { cartId: string; slugs: string[] }) {
  return (
    <button
      type="button"
      onClick={() => slugs.forEach((s) => writeBought(boughtKey(cartId, s), true))}
      className="bg-verde-certo text-tinta rounded-botao flex h-14 w-full shrink-0 items-center justify-center gap-2 text-base font-extrabold"
    >
      Já comprei tudo
    </button>
  );
}
