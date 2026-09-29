import Link from "next/link";

const EXIT =
  "text-verde-fundo focus-visible:outline-verde-fundo flex min-h-11 items-center text-[14px] font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2";

type Props = {
  /** Há filtro de bairro ou de modalidade ativo: o texto muda e "Tirar filtros" aparece. */
  hasFilter: boolean;
  cartHref: string;
  clearFiltersHref: string;
  /** Página da lista (onde está o botão de compartilhar); null quando não dá para resolver. */
  shareHref: string | null;
};

/** Vazio padrão (DESIGN.md §6): frase útil e ações, nunca "nada aqui". */
export function NoStationeries({ hasFilter, cartHref, clearFiltersHref, shareHref }: Props) {
  return (
    <div
      role="status"
      data-testid="no-stationeries"
      className="border-linha-tracejada flex flex-col gap-1.5 rounded-[22px] border-[1.5px] border-dashed p-[18px]"
    >
      <p className="text-[15px] font-extrabold">Nenhuma papelaria para mostrar</p>
      <p className="text-texto-2 text-[13px] leading-[1.4] font-medium">
        {hasFilter
          ? "Nenhuma papelaria cadastrada atende com os filtros escolhidos. Tire os filtros para ver todas da região."
          : "Ainda não há papelaria cadastrada nesta região. Compartilhe a lista para que uma papelaria do seu bairro a conheça."}
      </p>
      <ul className="mt-1 flex flex-col">
        {hasFilter ? (
          <li>
            <Link href={clearFiltersHref} className={EXIT}>
              Tirar filtros
            </Link>
          </li>
        ) : null}
        {shareHref ? (
          <li>
            <Link href={shareHref} className={EXIT}>
              Compartilhar a lista
            </Link>
          </li>
        ) : null}
        <li>
          <Link href={cartHref} className={EXIT}>
            Voltar ao carrinho
          </Link>
        </li>
      </ul>
    </div>
  );
}
