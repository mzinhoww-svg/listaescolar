import type { StoreInfo } from "@/features/cart/service";
import type { CartOption, OptionLine } from "@/features/cart/types";

// Fixtures de teste: valores fictícios.
export const CHECKED = new Date("2026-09-24T12:30:00.000Z");
export const CART = "11111111-1111-4111-8111-111111111111";

export const priced = (over: Partial<OptionLine> = {}): OptionLine => ({
  itemKey: "caderno",
  name: "Caderno",
  quantity: 2,
  status: "priced",
  storeId: "amazon",
  unitPriceCents: 1500,
  lineTotalCents: 3000,
  source: "manual_admin",
  checkedAt: CHECKED,
  url: "https://www.amazon.com.br/produto-secreto",
  ...over,
});
export const missing: OptionLine = {
  itemKey: "cola",
  name: "Cola",
  quantity: 1,
  status: "unavailable",
  storeId: null,
  unitPriceCents: null,
  lineTotalCents: null,
  source: null,
  checkedAt: null,
};
export const option = (over: Partial<CartOption> = {}): CartOption => ({
  strategy: "cheapest",
  status: "available",
  totalCents: 3000,
  lines: [priced()],
  stores: ["amazon"],
  missingItems: [],
  staleExcluded: [],
  ...over,
});
export const stores: Record<string, StoreInfo> = {
  amazon: { id: "amazon", name: "Amazon", initials: "A", affiliateApplied: false },
};
