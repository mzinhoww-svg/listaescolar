import type { Metadata } from "next";

import { BackHeader } from "@/components/cart/CartStates";
import { ItemsList } from "@/components/cart/ItemsList";
import { OptionCard } from "@/components/cart/OptionCard";
import { OptionDetail } from "@/components/cart/OptionDetail";
import { PriceNotice } from "@/components/cart/badges";
import { Screen } from "@/components/auth/Screen";
import { chooseOption, parseStrategy, requireCartView } from "@/features/cart/page-data";

import { chooseOptionAction } from "./actions";

export const metadata: Metadata = { title: "Seu carrinho · ListaCerta" };

export default async function CarrinhoPage({ params, searchParams }: PageProps<"/carrinho/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const wanted = parseStrategy(sp.opcao);
  const view = await requireCartView(id, `/carrinho/${id}`);
  const selected = chooseOption(view.options, wanted, view.cart.strategy);
  const usable = view.options.filter((o) => o.status !== "unavailable" && o.totalCents !== null);
  const anyDemo = view.cart.isDemo;
  return (
    <Screen>
      <BackHeader href="/" title="Seu carrinho" />
      <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        {usable.length === 0
          ? "Nenhuma opção com preço disponível"
          : `Montamos ${usable.length} ${usable.length === 1 ? "opção" : "opções"} para a lista`}
      </h1>
      {anyDemo ? (
        <p className="text-texto-2 text-xs font-semibold">
          Carrinho criado a partir de uma lista de demonstração (itens de exemplo).
        </p>
      ) : null}
      {usable.length === 0 ? (
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Ainda não há preço de fonte identificada para estes itens. Não estimamos valores: tudo
          aparece como indisponível até haver uma fonte.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Opções de compra">
        {view.options.map((o) => (
          <OptionCard
            key={o.strategy}
            option={o}
            cartId={id}
            selected={o.strategy === selected.strategy}
            action={chooseOptionAction}
          />
        ))}
      </ul>
      {usable.length > 0 ? (
        <OptionDetail option={selected} stores={view.stores} />
      ) : (
        <PriceNotice />
      )}
      <ItemsList items={view.cart.items} />
    </Screen>
  );
}
