import { formatBRL } from "@/features/cart/money";
import type { CartOption, CartStrategy, OptionLine } from "@/features/cart/types";

export const STRATEGY_LABEL: Record<CartStrategy, string> = {
  cheapest: "Mais barato",
  balanced: "Recomendado",
  fewest_stores: "Menos lojas",
  local_stationery: "Papelaria local",
};

export const STRATEGY_TAG: Record<CartStrategy, string> = {
  cheapest: "Menor preço",
  balanced: "Equilíbrio",
  fewest_stores: "Menos lojas",
  local_stationery: "Cotação local",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Cuiaba",
});

export function formatCheckedAt(date: Date): string {
  return dateFormat.format(date);
}

/** Origens de preço conhecidas (ver `price_snapshots.source` e `CATALOG_PRICE_SOURCE`). Acrescentar uma exige o rótulo aqui. */
export const PRICE_SOURCES = ["demo", "informed_by_stationery", "manual_admin"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const SOURCE_LABEL: Record<PriceSource, string> = {
  demo: "demonstração",
  informed_by_stationery: "informado pela papelaria",
  manual_admin: "cadastro da equipe ListaCerta",
};

/** Nunca mostra o código técnico: feeds (`retailer_feed:<nome>`) e origens novas caem em rótulos genéricos em pt-BR. */
export function sourceLabel(source: string): string {
  if ((PRICE_SOURCES as readonly string[]).includes(source)) return SOURCE_LABEL[source as PriceSource];
  if (source.startsWith("retailer_feed:")) return "informado pela loja";
  return "fonte informada";
}

export function moneyOrUnavailable(cents: number | null): string {
  return cents === null ? "indisponível" : formatBRL(cents);
}

export function optionHasDemo(option: CartOption): boolean {
  return option.lines.some((l) => l.isDemo === true);
}

export function pricedLines(option: CartOption): OptionLine[] {
  return option.lines.filter((l) => l.status === "priced");
}

/** Prazo só quando a fonte o trouxe em todas as linhas com preço; senão indisponível. */
export function deliveryText(option: CartOption): string {
  const priced = pricedLines(option);
  if (priced.length === 0) return "prazo indisponível";
  const days = priced.map((l) => l.deliveryDays);
  if (days.some((d) => d === undefined)) return "prazo indisponível";
  return `chega em até ${Math.max(...(days as number[]))} dias`;
}

/** Estoque só quando a fonte o trouxe em todas as linhas com preço; senão indisponível. */
export function stockText(option: CartOption): string {
  const priced = pricedLines(option);
  if (priced.length === 0 || priced.some((l) => l.inStock === undefined)) {
    return "estoque indisponível";
  }
  return priced.every((l) => l.inStock === true) ? "em estoque" : "sem estoque em algum item";
}

export function isSelectable(option: CartOption): boolean {
  return option.status !== "unavailable" && option.totalCents !== null;
}

/** Sem nenhuma opção com preço, a cotação da papelaria local vem primeiro: é o caminho que resta. */
export function orderOptions(options: readonly CartOption[]): CartOption[] {
  if (options.some(isSelectable)) return [...options];
  return [...options].sort((a, b) => Number(b.strategy === "local_stationery") - Number(a.strategy === "local_stationery"));
}

export function storesText(option: CartOption): string {
  if (!isSelectable(option)) return "sem lojas com preço";
  return option.stores.length === 1 ? "1 loja" : `${option.stores.length} lojas`;
}

/** Opções sem preço de loja (a papelaria local fica de fora: ela tem o próprio caminho, a cotação). */
export function unpricedStoreOptions(options: readonly CartOption[]): CartOption[] {
  return options.filter((o) => !isSelectable(o) && o.strategy !== "local_stationery");
}

/** Opções que ganham cartão: as com preço e a papelaria local (que traz o pedido de cotação). */
export function visibleOptions(options: readonly CartOption[]): CartOption[] {
  return options.filter((o) => isSelectable(o) || o.strategy === "local_stationery");
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
