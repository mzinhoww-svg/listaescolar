import type { Metadata } from "next";
import Link from "next/link";

import { Screen } from "@/components/auth/Screen";
import { BoughtAll } from "@/components/cart/BoughtControls";
import { BackHeader } from "@/components/cart/CartStates";
import { StoreCard } from "@/components/cart/StoreCard";
import { DemoBadge } from "@/components/cart/badges";
import {
  isSelectable,
  moneyOrUnavailable,
  optionHasDemo,
  STRATEGY_LABEL,
} from "@/components/cart/format";
import { chooseOption, parseStrategy, requireCartView } from "@/features/cart/page-data";
import type { OptionLine } from "@/features/cart/types";

export const metadata: Metadata = { title: "Comprar por loja · ListaCerta" };

export default async function CheckoutPage({
  params,
  searchParams,
}: PageProps<"/carrinho/[id]/checkout">) {
  const { id } = await params;
  const sp = await searchParams;
  const wanted = parseStrategy(sp.opcao);
  const view = await requireCartView(id, `/carrinho/${id}/checkout`);
  const option = chooseOption(view.options, wanted);
  const back = `/carrinho/${id}`;

  if (!isSelectable(option)) {
    return (
      <Screen>
        <BackHeader href={back} title="Comprar por loja" />
        <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.035em]">
          Sem lojas com preço disponível
        </h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Não há preço de fonte identificada para esta opção. Volte ao carrinho e veja as demais.
        </p>
        <Link
          href={back}
          className="bg-tinta text-papel rounded-botao flex h-14 items-center justify-center text-base font-extrabold"
        >
          Voltar ao carrinho
        </Link>
      </Screen>
    );
  }

  const byStore = new Map<string, OptionLine[]>();
  for (const line of option.lines) {
    if (line.storeId === null || line.status !== "priced") continue;
    byStore.set(line.storeId, [...(byStore.get(line.storeId) ?? []), line]);
  }
  const remote = [...byStore.entries()].filter(([slug]) => view.stores[slug]);
  const opened = remote.filter(([slug]) => view.openedSlugs.includes(slug)).length;
  const pct = remote.length === 0 ? 0 : Math.round((opened / remote.length) * 100);
  // Item do carrinho que corresponde à linha (a busca da loja usa o nome dele).
  const itemIdFor = (line: OptionLine) =>
    view.cart.items.find((i) => i.itemKey === line.itemKey)?.id;

  return (
    <Screen>
      <BackHeader href={back} title="Comprar por loja" />
      <section className="bg-tinta text-papel flex flex-col gap-2.5 rounded-[22px] p-[18px]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold">{STRATEGY_LABEL[option.strategy]}</p>
          <p className="text-sm font-extrabold" data-testid="checkout-total">
            {moneyOrUnavailable(option.totalCents)}
          </p>
        </div>
        <div
          className="h-2 rounded bg-[#1F2E45]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-verde-certo h-2 rounded" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs font-bold text-[#B9C2CF]">
          {opened} de {remote.length} {remote.length === 1 ? "loja aberta" : "lojas abertas"}
        </p>
        {optionHasDemo(option) ? <DemoBadge /> : null}
      </section>
      <ul className="flex flex-col gap-3">
        {remote.map(([slug, lines], idx) => (
          <StoreCard
            key={slug}
            cartId={id}
            info={view.stores[slug]!}
            lines={lines}
            itemIdFor={itemIdFor}
            opened={view.openedSlugs.includes(slug)}
            primary={idx === 0}
          />
        ))}
      </ul>
      <p className="bg-campo text-texto-2 rounded-campo px-3 py-3 text-xs leading-[1.4] font-semibold">
        Preço e estoque podem mudar. Onde houver o selo &quot;link afiliado&quot;, a ListaCerta pode
        receber comissão e o preço é o mesmo para você.
      </p>
      <div className="flex-1" />
      <BoughtAll cartId={id} slugs={remote.map(([slug]) => slug)} />
    </Screen>
  );
}
