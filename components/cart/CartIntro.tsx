import type { CartOption } from "@/features/cart/types";

import { hasUnavailableDeliveryOrStock, isSelectable, plural, STRATEGY_LABEL, unpricedStoreOptions } from "./format";

/**
 * Título e nota do carrinho. O título conta só as opções com preço; as sem preço entram num único aviso
 * e, sem nenhum preço de fonte, o título orienta para a cotação da papelaria.
 */
export function CartIntro({ options, isDemo = false }: { options: readonly CartOption[]; isDemo?: boolean }) {
  const n = options.filter(isSelectable).length;
  const unpriced = unpricedStoreOptions(options);
  return (
    <>
      <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        {n > 0 ? `Montamos ${plural(n, "opção", "opções")} para a lista` : "Peça a cotação a uma papelaria"}
      </h1>
      {isDemo ? (
        <p className="text-texto-2 text-xs font-semibold">Carrinho criado a partir de uma lista de demonstração (itens de exemplo).</p>
      ) : null}
      {n === 0 ? (
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Ainda não temos preço de loja para esta lista. A papelaria informa o preço na cotação. Não estimamos valores: sem fonte, aparece
          como indisponível.
        </p>
      ) : unpriced.length > 0 ? (
        <p className="text-texto-2 text-[13px] leading-[1.4] font-semibold">
          {`Sem preço de loja para: ${unpriced.map((o) => STRATEGY_LABEL[o.strategy]).join(", ")}.`}
        </p>
      ) : null}
      {n > 0 && hasUnavailableDeliveryOrStock(options) ? (
        <p className="text-texto-2 text-[13px] leading-[1.4] font-semibold">
          Prazo e estoque: indisponíveis quando a fonte não informa. Confira na loja antes de comprar.
        </p>
      ) : null}
    </>
  );
}
