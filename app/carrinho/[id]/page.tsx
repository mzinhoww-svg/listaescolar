import type { Metadata } from "next";

import { TrackView } from "@/components/analytics/TrackView";
import { BackHeader } from "@/components/cart/CartStates";
import { CartIntro } from "@/components/cart/CartIntro";
import { orderOptions, visibleOptions } from "@/components/cart/format";
import { ItemsList } from "@/components/cart/ItemsList";
import { OptionCard } from "@/components/cart/OptionCard";
import { OptionDetail } from "@/components/cart/OptionDetail";
import { PriceNotice } from "@/components/cart/badges";
import { Screen } from "@/components/auth/Screen";
import { getListOriginByVersion, listOriginHref } from "@/features/lists/queries";
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
  // "Voltar" leva à lista de origem quando ela é pública; cópia privada, demonstração ou falha de consulta voltam ao início.
  let backHref = "/";
  if (view.cart.listId) {
    try {
      backHref = listOriginHref(await getListOriginByVersion(view.cart.listId)) ?? "/";
    } catch {
      backHref = "/";
    }
  }
  return (
    <Screen>
      <BackHeader href={backHref} title="Seu carrinho" />
      <TrackView name="cart_options_viewed" props={{ options_count: view.options.length }} />
      <CartIntro options={view.options} isDemo={anyDemo} />
      <ul className="flex flex-col gap-3" aria-label="Opções de compra">
        {orderOptions(visibleOptions(view.options)).map((o) => (
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
