import { mulCents, sumCents } from "./money";
import { emptyLine, type NormItem, type Offer } from "./options-engine-normalize";
import type { CartOption, CartStrategy, OptionLine, OptionReason } from "./types";

/**
 * Atribuição de itens a lojas e as 3 estratégias que escolhem entre combinações (`cheapest`, `fewest_stores`,
 * `balanced`), extraídas de `options-engine.ts` (D-057, S18) — comportamento idêntico ao original. Fórmula de
 * `balanced` (determinística, inteiros; pesos em permil) documentada no arquivo principal.
 */

export const BALANCED_WEIGHT_PRICE = 500;
export const BALANCED_WEIGHT_STORES = 200;
export const BALANCED_WEIGHT_AVAILABILITY = 200;
export const BALANCED_WEIGHT_DELIVERY = 100;
export const BALANCED_WEIGHTS = {
  price: BALANCED_WEIGHT_PRICE,
  stores: BALANCED_WEIGHT_STORES,
  availability: BALANCED_WEIGHT_AVAILABILITY,
  delivery: BALANCED_WEIGHT_DELIVERY,
} as const;
const SCALE = BigInt(1_000_000);

/** Acima disto só as lojas que cobrem mais itens entram na enumeração de combinações (2^n). */
export const MAX_SUBSET_RETAILERS = 12;

export type Assignment = {
  lines: OptionLine[];
  stores: string[];
  totalCents: number | null;
  priced: number;
  /** Alguma linha estourou o inteiro seguro (preço x quantidade); a opção não tem total confiável. */
  overflow: boolean;
};

/** Cada item vai à oferta mais barata entre `storeIds` (desempate por id da loja, ordem alfabética). */
export function assign(
  items: NormItem[],
  byStore: Map<string, Map<string, Offer>>,
  storeIds: readonly string[],
): Assignment {
  const ordered = [...storeIds].sort();
  const lines: OptionLine[] = [];
  const used = new Set<string>();
  const amounts: number[] = [];
  let overflow = false;
  for (const item of items) {
    let pick: Offer | null = null;
    for (const id of ordered) {
      const o = byStore.get(id)?.get(item.itemKey);
      if (o && (!pick || o.unitPriceCents < pick.unitPriceCents)) pick = o;
    }
    const lineTotal = pick ? mulCents(pick.unitPriceCents, item.quantity) : null;
    if (pick && lineTotal === null) overflow = true;
    if (!pick || lineTotal === null) {
      lines.push(emptyLine(item));
      continue;
    }
    used.add(pick.storeId);
    amounts.push(lineTotal);
    lines.push({
      itemKey: item.itemKey,
      name: item.name,
      quantity: item.quantity,
      status: "priced",
      storeId: pick.storeId,
      unitPriceCents: pick.unitPriceCents,
      lineTotalCents: lineTotal,
      source: pick.source,
      checkedAt: pick.checkedAt,
      url: pick.url,
      deliveryDays: pick.deliveryDays,
      inStock: pick.inStock,
      isDemo: pick.isDemo,
    });
  }
  const totalCents = sumCents(amounts);
  return {
    lines,
    stores: [...used].sort(),
    totalCents,
    priced: amounts.length,
    overflow: overflow || (amounts.length > 0 && totalCents === null),
  };
}

export function unavailable(
  strategy: CartStrategy,
  items: NormItem[],
  invalid: string[],
  reason: OptionReason,
  stale: string[],
): CartOption {
  return {
    strategy,
    status: "unavailable",
    totalCents: null,
    lines: items.map(emptyLine),
    stores: [],
    missingItems: [...items.map((i) => i.itemKey), ...invalid],
    reason,
    staleExcluded: stale,
  };
}

export function toOption(
  strategy: CartStrategy,
  a: Assignment,
  items: NormItem[],
  invalid: string[],
  stale: string[],
): CartOption {
  if (a.overflow) return unavailable(strategy, items, invalid, "amount_overflow", stale);
  if (a.priced === 0) return unavailable(strategy, items, invalid, "no_price_source", stale);
  if (a.totalCents === null) return unavailable(strategy, items, invalid, "amount_overflow", stale);
  const missing = [
    ...a.lines.filter((l) => l.status === "unavailable").map((l) => l.itemKey),
    ...invalid,
  ];
  return {
    strategy,
    status: missing.length === 0 ? "available" : "partial",
    totalCents: a.totalCents,
    lines: a.lines,
    stores: a.stores,
    missingItems: missing,
    staleExcluded: stale,
  };
}

export type Candidate = Assignment & { key: string };

/** Combinações de lojas em que toda loja escolhida é de fato usada e a cobertura é a máxima. */
export function fullCoverageCandidates(
  items: NormItem[],
  byStore: Map<string, Map<string, Offer>>,
): Candidate[] {
  let ids = [...byStore.keys()].sort();
  if (ids.length > MAX_SUBSET_RETAILERS) {
    ids = ids
      .sort((a, b) => (byStore.get(b)?.size ?? 0) - (byStore.get(a)?.size ?? 0) || (a < b ? -1 : 1))
      .slice(0, MAX_SUBSET_RETAILERS)
      .sort();
  }
  const all = assign(items, byStore, ids);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const subset = ids.filter((_, i) => (mask >> i) & 1);
    const a = assign(items, byStore, subset);
    if (a.priced !== all.priced || a.totalCents === null || a.stores.length !== subset.length)
      continue;
    const key = a.stores.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...a, key });
  }
  return out;
}

function maxDelivery(a: Assignment): number | null {
  let max = 0;
  for (const l of a.lines) {
    if (l.status !== "priced") continue;
    if (l.deliveryDays === undefined || !Number.isSafeInteger(l.deliveryDays) || l.deliveryDays < 0)
      return null;
    max = Math.max(max, l.deliveryDays);
  }
  return max;
}

function ratio(num: bigint, den: bigint): bigint {
  return (num * SCALE) / den;
}

/** Linhas com estoque confirmado pela fonte (`inStock === true`); desconhecido não conta. */
function confirmedAvailability(a: Assignment): number {
  return a.lines.filter((l) => l.status === "priced" && l.inStock === true).length;
}

export function pickBalanced(cands: Candidate[], itemCount: number): Candidate {
  const totals = cands.map((c) => BigInt(c.totalCents ?? 0));
  const minTotal = totals.reduce((m, t) => (t < m ? t : m));
  const minStores = Math.min(...cands.map((c) => c.stores.length));
  const deliveries = cands.map(maxDelivery);
  const known = deliveries.filter((d): d is number => d !== null);
  const useDelivery = known.length > 0;
  const minDelivery = useDelivery ? Math.min(...known) : 0;
  const scored = cands.map((c, i) => {
    const d = deliveries[i] ?? null;
    let score =
      BigInt(BALANCED_WEIGHT_PRICE) * ratio(minTotal, totals[i] ?? BigInt(1)) +
      BigInt(BALANCED_WEIGHT_STORES) * ratio(BigInt(minStores), BigInt(c.stores.length)) +
      BigInt(BALANCED_WEIGHT_AVAILABILITY) *
        ratio(BigInt(confirmedAvailability(c)), BigInt(itemCount));
    if (useDelivery && d !== null) {
      score += BigInt(BALANCED_WEIGHT_DELIVERY) * ratio(BigInt(1 + minDelivery), BigInt(1 + d));
    }
    return { c, score, total: totals[i] ?? BigInt(0) };
  });
  scored.sort((x, y) =>
    x.score !== y.score
      ? x.score > y.score
        ? -1
        : 1
      : x.total !== y.total
        ? x.total < y.total
          ? -1
          : 1
        : x.c.stores.length - y.c.stores.length ||
          (x.c.key < y.c.key ? -1 : x.c.key > y.c.key ? 1 : 0),
  );
  const first = scored[0];
  if (!first) throw new Error("sem candidatos");
  return first.c;
}

export function pickFewestStores(cands: Candidate[]): Candidate {
  const sorted = [...cands].sort(
    (a, b) =>
      a.stores.length - b.stores.length ||
      (a.totalCents ?? 0) - (b.totalCents ?? 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const first = sorted[0];
  if (!first) throw new Error("sem candidatos");
  return first;
}

export function localAssignment(
  items: NormItem[],
  byStore: Map<string, Map<string, Offer>>,
): Assignment | null {
  let best: Assignment | null = null;
  let overflowed: Assignment | null = null;
  for (const id of [...byStore.keys()].sort()) {
    const a = assign(items, byStore, [id]);
    if (a.overflow) {
      overflowed ??= a;
      continue;
    }
    if (a.priced === 0 || a.totalCents === null) continue;
    if (
      !best ||
      a.priced > best.priced ||
      (a.priced === best.priced && a.totalCents < (best.totalCents ?? 0))
    )
      best = a;
  }
  return best ?? overflowed;
}
