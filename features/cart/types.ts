export type CartStrategy = "cheapest" | "fewest_stores" | "balanced" | "local_stationery";
export const CART_STRATEGIES: readonly CartStrategy[] = [
  "cheapest",
  "fewest_stores",
  "balanced",
  "local_stationery",
];

export type OptionStatus = "available" | "partial" | "unavailable";
export type OptionReason = "empty_cart" | "no_price_source" | "no_local_quote" | "amount_overflow";

export type CartItemInput = { itemKey: string; name: string; quantity: number };

/** Preço de uma loja. Sem `source` e `checkedAt` ele não existe para o motor. */
export type Quote = {
  retailerSlug: string;
  itemKey: string;
  unitPriceCents: number;
  source: string;
  checkedAt: Date;
  url?: string;
  deliveryDays?: number;
  inStock?: boolean;
  isDemo?: boolean;
};

/** Cotação da papelaria local (porta implementada nas fatias S13/S14, ligada na S11). */
export type LocalQuote = {
  stationeryId: string;
  itemKey: string;
  unitPriceCents: number;
  source: string;
  checkedAt: Date;
  deliveryDays?: number;
  inStock?: boolean;
  isDemo?: boolean;
};

export type OptionLine = {
  itemKey: string;
  name: string;
  quantity: number;
  status: "priced" | "unavailable";
  /** Id da loja: slug do varejista ou `local:<stationeryId>`. */
  storeId: string | null;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  source: string | null;
  checkedAt: Date | null;
  url?: string;
  deliveryDays?: number;
  inStock?: boolean;
  isDemo?: boolean;
};

export type CartOption = {
  strategy: CartStrategy;
  status: OptionStatus;
  totalCents: number | null;
  lines: OptionLine[];
  stores: string[];
  missingItems: string[];
  reason?: OptionReason;
  /** `<loja>:<itemKey>` cujas únicas cotações estavam velhas (ou com data inconfiável) e ficaram fora do total. */
  staleExcluded: string[];
};

export type BuildOptionsSettings = { staleAfterMs?: number };
