import Link from "next/link";

import type { CartOption } from "@/features/cart/types";

import { DemoBadge, Tag } from "./badges";
import { SubmitButton } from "./SubmitButton";
import {
  deliveryText,
  isSelectable,
  moneyOrUnavailable,
  optionHasDemo,
  STRATEGY_LABEL,
  STRATEGY_TAG,
  stockText,
  storesText,
} from "./format";

type Props = {
  option: CartOption;
  cartId: string;
  selected: boolean;
  /** Server Action de "Escolher esta" (grava a estratégia e o retrato das opções). */
  action: (formData: FormData) => Promise<void>;
};

/** Cartão de opção (App17). Total só quando há preço com origem; senão "indisponível". */
export function OptionCard({ option, cartId, selected, action }: Props) {
  const usable = isSelectable(option);
  const current = selected && usable;
  const base = `/carrinho/${cartId}`;
  return (
    <li
      data-testid={`option-${option.strategy}`}
      aria-current={current ? "true" : undefined}
      className={`bg-branco-tonal flex flex-col gap-3 rounded-[24px] p-5 ${current ? "border-tinta border-2" : "border-2 border-transparent"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">{STRATEGY_LABEL[option.strategy]}</h2>
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
          <p>{usable ? stockText(option) : null}</p>
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
          <form action={action} className="flex flex-1">
            <input type="hidden" name="cartId" value={cartId} />
            <input type="hidden" name="strategy" value={option.strategy} />
            <SubmitButton
              pendingLabel="Salvando..."
              className="bg-tinta text-papel rounded-botao flex h-11 flex-1 items-center justify-center text-sm font-extrabold"
            >
              Escolher esta
            </SubmitButton>
          </form>
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
