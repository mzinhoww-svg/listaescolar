import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import type { CartOption, CartStrategy } from "@/features/cart/types";

import { DemoBadge, Tag } from "./badges";
import { SubmitButton } from "./SubmitButton";
import {
  deliveryText,
  isSelectable,
  partialText,
  moneyOrUnavailable,
  plural,
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
  /** Opção dominante da tela: só ela leva "Escolher esta" em Tinta cheio; as demais ficam em contorno (uma ação principal por região). */
  dominant?: boolean;
  /** Sem nenhuma opção com preço, o pedido de cotação é a ação principal da tela. */
  quotePrimary?: boolean;
  /** Opção que a pessoa está vendo na tela: vai na URL do pedido de cotação para o "voltar" reencontrá-la. */
  pageStrategy?: CartStrategy;
  /** Server Action de "Escolher esta" (grava a estratégia e o retrato das opções). */
  action: (formData: FormData) => Promise<void>;
};

/** Cartão de opção (App17). Total só quando há preço com origem; senão "indisponível". */
export function OptionCard({ option, cartId, selected, dominant = false, quotePrimary = false, pageStrategy, action }: Props) {
  const usable = isSelectable(option);
  const current = selected && usable;
  const base = `/carrinho/${cartId}`;
  const quoteHref = `/cotacao/nova?carrinho=${cartId}${pageStrategy ? `&opcao=${pageStrategy}` : ""}`;
  const quoteLink =
    option.strategy === "local_stationery" ? (
      <Link href={quoteHref} className={quotePrimary ? buttonClass("primary", "md", "text-center") : buttonClass("text", "md", "text-center text-sm")}>
        Pedir cotação a papelarias
      </Link>
    ) : null;
  const partial = option.status === "partial";
  return (
    <li
      data-testid={`option-${option.strategy}`}
      aria-current={current ? "true" : undefined}
      className={`bg-branco-tonal flex flex-col gap-3 rounded-[24px] p-5 ${current ? "border-tinta border-2" : "border-2 border-transparent"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">{STRATEGY_LABEL[option.strategy]}</h2>
        {usable && !partial ? (
          <Tag tone={option.strategy === "cheapest" ? "green" : "muted"}>
            {STRATEGY_TAG[option.strategy]}
          </Tag>
        ) : null}
      </div>
      {usable ? null : quoteLink}
      <div className="flex items-end justify-between gap-3">
        <p
          className={`${usable && !partial ? "text-[28px] font-extrabold" : "text-texto-2 text-xl font-semibold"} tracking-[-0.03em]`}
        >
          {moneyOrUnavailable(option.totalCents)}
        </p>
        <div className="text-texto-3 text-right text-xs leading-[1.4] font-bold">
          <p>{storesText(option)}</p>
          {/* Prazo e estoque indisponíveis vão uma vez no topo da tela; só entram no cartão quando a fonte informou. */}
          {usable && deliveryText(option) !== "prazo indisponível" ? <p>{deliveryText(option)}</p> : null}
          {usable && stockText(option) !== "estoque indisponível" ? <p>{stockText(option)}</p> : null}
        </div>
      </div>
      {optionHasDemo(option) ? <DemoBadge /> : null}
      {partial ? (
        <>
          <p className="text-texto-2 text-sm font-semibold">{partialText(option)}</p>
          <p className="text-texto-3 text-xs font-semibold">
            {plural(option.missingItems.length, "item sem preço disponível não entra", "itens sem preço disponível não entram")} na soma.
          </p>
        </>
      ) : null}
      {usable ? (
        <div className="flex gap-2">
          <Link
            href={`${base}?opcao=${option.strategy}#detalhe`}
            className={buttonClass("text", "md", "flex-1 justify-center text-sm")}
          >
            Ver detalhes
          </Link>
          <form action={action} className="flex flex-1">
            <input type="hidden" name="cartId" value={cartId} />
            <input type="hidden" name="strategy" value={option.strategy} />
            <SubmitButton
              pendingLabel="Salvando..."
              variant={dominant ? "primary" : "outline"}
              className="min-h-11 flex-1 text-sm"
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
      {usable ? quoteLink : null}
    </li>
  );
}
