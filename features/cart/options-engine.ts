import { isCents, isQuantity, mulCents, sumCents } from "./money";
import {
  CART_STRATEGIES,
  type BuildOptionsSettings,
  type CartItemInput,
  type CartOption,
  type CartStrategy,
  type LocalQuote,
  type OptionLine,
  type OptionReason,
  type Quote,
} from "./types";

/** Validade padrão de um preço: 24 h. Além disso ele fica "desatualizado" e sai do total. */
export const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Tolerância de relógio: data de consulta no futuro além disso é inconfiável e o preço é excluído. */
export const FUTURE_SKEW_MS = 5 * 60 * 1000;
/** Acima disto só as lojas que cobrem mais itens entram na enumeração de combinações (2^n). */
export const MAX_SUBSET_RETAILERS = 12;

/**
 * Fórmula de `balanced` (determinística, inteiros). Entre as combinações de lojas que cobrem o máximo
 * de itens cotados, pontua cada uma com pesos em permil:
 *   score = 500·preço + 200·lojas + 200·disponibilidade + 100·prazo
 *   preço = menorTotal/total · lojas = menorNºLojas/nºLojas
 *   disponibilidade = linhas com `inStock === true` (confirmado pela fonte) / nº de itens do carrinho;
 *     estoque desconhecido (`inStock` ausente) conta 0, nunca é presumido;
 *   prazo = (1+menorPrazo)/(1+prazoDaCombinação), prazo = maior deliveryDays entre as linhas.
 * Cada razão é escalada a 1e6 (BigInt no preço). Prazo só entra se alguma combinação tem prazo em
 * todas as linhas (vindo da fonte). PRAZO AUSENTE PONTUA 0: combinação com alguma linha sem
 * `deliveryDays` fica com 0 nesse termo (nunca se presume prazo). Sem prazo completo em nenhuma, o
 * termo sai e a comparação usa só os outros pesos. Todas as combinações têm a mesma cobertura de
 * preço (máxima); o termo de disponibilidade é o que diferencia estoque confirmado de desconhecido.
 * Desempate: maior score, menor total, menos lojas, lista de lojas em ordem alfabética.
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

type Offer = {
  storeId: string;
  itemKey: string;
  unitPriceCents: number;
  source: string;
  checkedAt: Date;
  url?: string;
  deliveryDays?: number;
  inStock?: boolean;
  isDemo?: boolean;
};
type NormItem = { itemKey: string; name: string; quantity: number };
type Assignment = {
  lines: OptionLine[];
  stores: string[];
  totalCents: number | null;
  priced: number;
  /** Alguma linha estourou o inteiro seguro (preço x quantidade); a opção não tem total confiável. */
  overflow: boolean;
};

function toOffer(q: Quote | LocalQuote): Offer {
  const storeId = "retailerSlug" in q ? q.retailerSlug : `local:${q.stationeryId}`;
  return {
    storeId,
    itemKey: q.itemKey,
    unitPriceCents: q.unitPriceCents,
    source: q.source,
    checkedAt: q.checkedAt,
    url: "url" in q ? q.url : undefined,
    deliveryDays: q.deliveryDays,
    inStock: q.inStock,
    isDemo: q.isDemo,
  };
}

function validOffer(o: Offer): boolean {
  return (
    o.storeId.trim() !== "" &&
    o.itemKey.trim() !== "" &&
    isCents(o.unitPriceCents) &&
    typeof o.source === "string" &&
    o.source.trim() !== "" &&
    o.checkedAt instanceof Date &&
    !Number.isNaN(o.checkedAt.getTime())
  );
}

function normalizeItems(items: readonly CartItemInput[]): { valid: NormItem[]; invalid: string[] } {
  const byKey = new Map<string, NormItem>();
  const bad = new Set<string>();
  for (const item of items) {
    if (item.itemKey.trim() === "") continue;
    if (!isQuantity(item.quantity)) {
      bad.add(item.itemKey);
      continue;
    }
    const prev = byKey.get(item.itemKey);
    if (prev) prev.quantity += item.quantity;
    else
      byKey.set(item.itemKey, { itemKey: item.itemKey, name: item.name, quantity: item.quantity });
  }
  const valid: NormItem[] = [];
  for (const entry of byKey.values()) {
    if (Number.isSafeInteger(entry.quantity)) valid.push(entry);
    else bad.add(entry.itemKey); // soma fora do inteiro seguro: vai para os inválidos, não some
  }
  // Uma entrada inválida não anula outra válida da mesma chave (essa continua cotada).
  const invalid = [...bad].filter((k) => valid.every((v) => v.itemKey !== k));
  return { valid, invalid };
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpOffer(a: Offer, b: Offer): number {
  return (
    a.unitPriceCents - b.unitPriceCents ||
    b.checkedAt.getTime() - a.checkedAt.getTime() ||
    cmpText(a.source, b.source) ||
    Number(a.isDemo === true) - Number(b.isDemo === true) || // real antes de demo
    cmpText(a.url ?? "", b.url ?? "")
  );
}

/** Filtra por validade/frescor/estoque e guarda a melhor oferta por (loja, item). */
function prepare(offers: Offer[], items: NormItem[], now: Date, staleAfterMs: number) {
  const wanted = new Set(items.map((i) => i.itemKey));
  const best = new Map<string, Offer>(); // storeId\u0000itemKey
  const staleKeys = new Map<string, { storeId: string; itemKey: string }>();
  for (const o of offers) {
    if (!validOffer(o) || !wanted.has(o.itemKey)) continue;
    const age = now.getTime() - o.checkedAt.getTime();
    if (age > staleAfterMs || age < -FUTURE_SKEW_MS) {
      staleKeys.set(`${o.storeId}\u0000${o.itemKey}`, { storeId: o.storeId, itemKey: o.itemKey });
      continue;
    }
    if (o.inStock === false) continue;
    const key = `${o.storeId}\u0000${o.itemKey}`;
    const prev = best.get(key);
    if (!prev || cmpOffer(o, prev) < 0) best.set(key, o);
  }
  // Pares estruturados: o separador só é aplicado na saída, então `local:<uuid>` não quebra a conferência.
  const staleExcluded = [...staleKeys.entries()]
    .filter(([key]) => !best.has(key))
    .map(([, pair]) => `${pair.storeId}:${pair.itemKey}`)
    .sort();
  const byStore = new Map<string, Map<string, Offer>>();
  for (const offer of best.values()) {
    const inner = byStore.get(offer.storeId) ?? new Map<string, Offer>();
    inner.set(offer.itemKey, offer);
    byStore.set(offer.storeId, inner);
  }
  return { byStore, staleExcluded };
}

function emptyLine(item: NormItem): OptionLine {
  return {
    itemKey: item.itemKey,
    name: item.name,
    quantity: item.quantity,
    status: "unavailable",
    storeId: null,
    unitPriceCents: null,
    lineTotalCents: null,
    source: null,
    checkedAt: null,
  };
}

/** Cada item vai à oferta mais barata entre `storeIds` (desempate por id da loja, ordem alfabética). */
function assign(
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

function unavailable(
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

function toOption(
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

type Candidate = Assignment & { key: string };

/** Combinações de lojas em que toda loja escolhida é de fato usada e a cobertura é a máxima. */
function fullCoverageCandidates(
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

function pickBalanced(cands: Candidate[], itemCount: number): Candidate {
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

function pickFewestStores(cands: Candidate[]): Candidate {
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

function localAssignment(
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

/**
 * Sempre devolve 4 opções, uma por estratégia, na ordem de CART_STRATEGIES. Nunca estima: sem preço
 * com origem e data válida a opção é `unavailable`; nenhum total sem `source` e `checkedAt`.
 */
export function buildCartOptions(
  items: readonly CartItemInput[],
  quotes: readonly Quote[],
  local: readonly LocalQuote[] | null,
  now: Date,
  settings: BuildOptionsSettings = {},
): CartOption[] {
  const staleAfterMs = settings.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const { valid, invalid } = normalizeItems(items);
  if (valid.length === 0) {
    return CART_STRATEGIES.map((s) => unavailable(s, valid, invalid, "empty_cart", []));
  }
  const remote = prepare(quotes.map(toOffer), valid, now, staleAfterMs);
  const stale = remote.staleExcluded;
  const out: CartOption[] = [];
  const everything = assign(valid, remote.byStore, [...remote.byStore.keys()]);
  const cands = everything.overflow ? [] : fullCoverageCandidates(valid, remote.byStore);
  for (const strategy of CART_STRATEGIES) {
    if (strategy === "local_stationery") {
      const l = local ? prepare(local.map(toOffer), valid, now, staleAfterMs) : null;
      const a = l ? localAssignment(valid, l.byStore) : null;
      out.push(
        a
          ? toOption(strategy, a, valid, invalid, l?.staleExcluded ?? [])
          : unavailable(strategy, valid, invalid, "no_local_quote", l?.staleExcluded ?? []),
      );
      continue;
    }
    if (everything.overflow) {
      out.push(toOption(strategy, everything, valid, invalid, stale));
      continue;
    }
    if (cands.length === 0) {
      out.push(unavailable(strategy, valid, invalid, "no_price_source", stale));
      continue;
    }
    const chosen =
      strategy === "cheapest"
        ? everything
        : strategy === "fewest_stores"
          ? pickFewestStores(cands)
          : pickBalanced(cands, valid.length);
    out.push(toOption(strategy, chosen, valid, invalid, stale));
  }
  return out;
}
