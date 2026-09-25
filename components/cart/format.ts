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

export function sourceLabel(source: string): string {
  return source === "demo" ? "demonstração" : source;
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

export function storesText(option: CartOption): string {
  if (!isSelectable(option)) return "sem lojas com preço";
  return option.stores.length === 1 ? "1 loja" : `${option.stores.length} lojas`;
}
