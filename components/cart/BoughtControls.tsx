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
      className={`${bought ? "bg-verde-certo border-verde-certo text-tinta" : "border-tinta text-tinta bg-transparent"} rounded-botao focus-visible:outline-verde-fundo flex h-11 w-full items-center justify-center border-[1.5px] text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2`}
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
