import { formatBRL } from "@/features/cart/money";
import type { StoreInfo } from "@/features/cart/service";
import type { CartOption, OptionLine } from "@/features/cart/types";

import { AffiliateBadge, DemoBadge, PriceNotice, StoreMark } from "./badges";
import { formatCheckedAt, optionHasDemo, sourceLabel, STRATEGY_LABEL } from "./format";

type Props = {
  option: CartOption;
  stores: Record<string, StoreInfo>;
};

function nameOf(stores: Record<string, StoreInfo>, id: string): string {
  return id.startsWith("local:") ? "Papelaria local" : (stores[id]?.name ?? id);
}

/** Uma linha: preço com origem e data/hora, ou "preço indisponível" sem número. Sem link de produto. */
export function LineRow({ line }: { line: OptionLine }) {
  if (line.status !== "priced" || line.unitPriceCents === null || line.lineTotalCents === null) {
    return (
      <li className="flex items-start justify-between gap-3 py-2">
        <p className="text-sm font-semibold">
          {line.name} <span className="text-texto-3">× {line.quantity}</span>
        </p>
        <p className="text-texto-3 text-sm font-bold">preço indisponível</p>
      </li>
    );
  }
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {line.name} <span className="text-texto-3">× {line.quantity}</span>
        </p>
        <p className="text-texto-3 text-[11px] leading-[1.4] font-medium">
          {formatBRL(line.unitPriceCents)} cada · origem: {sourceLabel(line.source ?? "")} ·{" "}
          {line.checkedAt ? formatCheckedAt(line.checkedAt) : ""}
        </p>
      </div>
      <p className="text-sm font-extrabold whitespace-nowrap">{formatBRL(line.lineTotalCents)}</p>
    </li>
  );
}

/** Detalhe da opção escolhida (App07): onde comprar cada parte, itens sem preço e total. */
export function OptionDetail({ option, stores }: Props) {
  const byStore = new Map<string, OptionLine[]>();
  for (const line of option.lines) {
    if (line.storeId === null || line.status !== "priced") continue;
    byStore.set(line.storeId, [...(byStore.get(line.storeId) ?? []), line]);
  }
  const unpriced = option.lines.filter((l) => l.storeId === null || l.status !== "priced");
  return (
    <section id="detalhe" aria-label="Detalhe da opção" className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold">Onde comprar cada parte</h2>
      <p className="text-texto-3 text-xs font-bold">Opção: {STRATEGY_LABEL[option.strategy]}</p>
      {[...byStore.entries()].map(([storeId, lines]) => {
        const info = stores[storeId];
        const subtotal = lines.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
        return (
          <div key={storeId} className="bg-branco-tonal flex flex-col gap-1 rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <StoreMark initials={info?.initials ?? "PL"} dark={storeId.startsWith("local:")} />
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-extrabold">{nameOf(stores, storeId)}</h3>
                <p className="text-texto-3 text-xs font-medium">
                  {lines.length} {lines.length === 1 ? "item" : "itens"} · subtotal{" "}
                  {formatBRL(subtotal)}
                </p>
              </div>
              {info?.affiliateApplied ? <AffiliateBadge /> : null}
            </div>
            <ul className="divide-linha divide-y">
              {lines.map((l) => (
                <LineRow key={l.itemKey} line={l} />
              ))}
            </ul>
          </div>
        );
      })}
      {unpriced.length > 0 ? (
        <div className="bg-branco-tonal flex flex-col gap-1 rounded-[24px] p-4">
          <h3 className="text-[15px] font-extrabold">Sem preço disponível</h3>
          <ul className="divide-linha divide-y">
            {unpriced.map((l) => (
              <LineRow key={l.itemKey} line={l} />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="bg-branco-tonal flex flex-col gap-2 rounded-[24px] p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-lg font-extrabold">Total</p>
          <p className="text-[22px] font-extrabold" data-testid="option-total">
            {option.totalCents === null ? "indisponível" : formatBRL(option.totalCents)}
          </p>
        </div>
        {option.status === "partial" ? (
          <p className="text-texto-2 text-xs font-semibold">
            Soma só dos itens com preço; {option.missingItems.length} sem preço disponível.
          </p>
        ) : null}
        {optionHasDemo(option) ? <DemoBadge /> : null}
        <p className="text-texto-3 text-xs font-medium">Frete: indisponível</p>
      </div>
      <PriceNotice />
    </section>
  );
}
