import { formatBRL } from "@/features/cart/money";
import type { StoreInfo } from "@/features/cart/service";
import type { OptionLine } from "@/features/cart/types";

import { AffiliateBadge, DemoBadge, StoreMark, Tag } from "./badges";
import { BoughtToggle } from "./BoughtControls";
import { LineRow } from "./OptionDetail";
import { formatCheckedAt } from "./format";

type Props = {
  cartId: string;
  info: StoreInfo;
  lines: OptionLine[];
  /** id do item do carrinho cuja busca abre a loja */
  itemIdFor: (line: OptionLine) => string | undefined;
  opened: boolean;
  primary: boolean;
};

/** Cartão de loja do checkout (App18). O botão vai à rota /ir-para (que registra o clique); nunca ao produto. */
export function StoreCard({ cartId, info, lines, itemIdFor, opened, primary }: Props) {
  const subtotal = lines.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
  const first = lines[0];
  const itemId = first ? itemIdFor(first) : undefined;
  const hrefFor = (id: string | undefined) =>
    `/ir-para/${cartId}/${info.id}${id ? `?item=${id}` : ""}`;
  const href = hrefFor(itemId);
  const oldest = lines.reduce<Date | null>(
    (d, l) => (l.checkedAt && (!d || l.checkedAt < d) ? l.checkedAt : d),
    null,
  );
  return (
    <li
      data-testid={`store-${info.id}`}
      className="bg-branco-tonal flex flex-col gap-3 rounded-[24px] p-4"
    >
      <div className="flex items-center gap-3">
        <StoreMark initials={info.initials} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-extrabold">{info.name}</h2>
          <p className="text-texto-3 text-xs font-medium">
            {lines.length} {lines.length === 1 ? "item" : "itens"} · subtotal {formatBRL(subtotal)}
          </p>
        </div>
        <Tag tone={opened ? "green" : "muted"}>{opened ? "Aberto" : "Falta abrir"}</Tag>
      </div>
      <div className="flex flex-wrap gap-2">
        {info.affiliateApplied ? <AffiliateBadge /> : null}
        {lines.some((l) => l.isDemo) ? <DemoBadge /> : null}
      </div>
      <ul className="divide-linha divide-y">
        {lines.map((l) => (
          <LineRow
            key={l.itemKey}
            line={l}
            storeLabel={info.name}
            searchHref={hrefFor(itemIdFor(l))}
          />
        ))}
      </ul>
      {oldest ? (
        <p className="text-texto-3 text-[11px] font-medium">
          Preço mais antigo verificado em {formatCheckedAt(oldest)}.
        </p>
      ) : null}
      {/* Âncora simples (não Link): o clique é registrado no servidor e não pode ser pré-carregado. */}
      <a
        href={href}
        className={`${primary ? "bg-tinta text-papel" : "border-tinta text-tinta border-[1.5px]"} rounded-botao flex min-h-11 w-full items-center justify-center px-4 py-2 text-center text-sm font-extrabold`}
      >
        Abrir busca de {first?.name ?? "item"} em {info.name}
      </a>
      <BoughtToggle cartId={cartId} slug={info.id} name={info.name} />
    </li>
  );
}
