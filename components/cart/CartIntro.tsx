import type { CartOption } from "@/features/cart/types";

import { isSelectable } from "./format";

/** Título e nota do carrinho. A contagem é a das opções exibidas; sem preço de fonte, a cotação é o caminho. */
export function CartIntro({ options, isDemo = false }: { options: readonly CartOption[]; isDemo?: boolean }) {
  const anyPrice = options.some(isSelectable);
  const n = options.length;
  return (
    <>
      <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        Montamos {n} {n === 1 ? "opção" : "opções"} para a lista
      </h1>
      {isDemo ? (
        <p className="text-texto-2 text-xs font-semibold">Carrinho criado a partir de uma lista de demonstração (itens de exemplo).</p>
      ) : null}
      {anyPrice ? null : (
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Ainda não temos preço de loja para esta lista. A papelaria informa o preço na cotação. Não estimamos valores: sem fonte, aparece
          como indisponível.
        </p>
      )}
    </>
  );
}
