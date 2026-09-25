import Link from "next/link";

import type { CartOption } from "@/features/cart/types";

import { DemoBadge, Tag } from "./badges";
import {
  deliveryText,
  isSelectable,
  moneyOrUnavailable,
  optionHasDemo,
  STRATEGY_LABEL,
  STRATEGY_TAG,
  storesText,
} from "./format";

type Props = { option: CartOption; cartId: string; selected: boolean };

/** Cartão de opção (App17). Total só quando há preço com origem; senão "indisponível". */
export function OptionCard({ option, cartId, selected }: Props) {
  const usable = isSelectable(option);
  const base = `/carrinho/${cartId}`;
  return (
    <li
      data-testid={`option-${option.strategy}`}
      className={`bg-branco-tonal flex flex-col gap-3 rounded-[24px] p-5 ${selected ? "border-tinta border-2" : "border-2 border-transparent"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">{STRATEGY_LABEL[option.strategy]}</h3>
        {usable ? (
          <Tag tone={option.strategy === "cheapest" ? "green" : "muted"}>
            {STRATEGY_TAG[option.strategy]}
          </Tag>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p
          className={`${usable ? "text-[28px]" : "text-texto-3 text-xl"} font-extrabold tracking-[-0.03em]`}
        >
          {moneyOrUnavailable(option.totalCents)}
        </p>
        <div className="text-texto-3 text-right text-xs leading-[1.4] font-bold">
          <p>{storesText(option)}</p>
          <p>{deliveryText(option)}</p>
        </div>
      </div>
      {optionHasDemo(option) ? <DemoBadge /> : null}
      {option.status === "partial" ? (
        <p className="text-texto-2 text-xs font-semibold">
          Total parcial: {option.missingItems.length} item(ns) sem preço disponível.
        </p>
      ) : null}
      {usable ? (
        <div className="flex gap-2">
          <Link
            href={`${base}?opcao=${option.strategy}#detalhe`}
            className="border-tinta text-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-sm font-extrabold"
          >
            Ver detalhes
          </Link>
          <Link
            href={`${base}/checkout?opcao=${option.strategy}`}
            className="bg-tinta text-papel rounded-botao flex h-11 flex-1 items-center justify-center text-sm font-extrabold"
          >
            Escolher esta
          </Link>
        </div>
      ) : (
        <p className="text-texto-3 text-xs font-semibold">
          {option.strategy === "local_stationery"
            ? "Sem cotação da papelaria local."
            : "Sem preço de fonte identificada para esta opção."}
        </p>
      )}
    </li>
  );
}
