import {
  assign,
  fullCoverageCandidates,
  localAssignment,
  pickBalanced,
  pickFewestStores,
  toOption,
  unavailable,
} from "./options-engine-assign";
import { normalizeItems, prepare, toOffer } from "./options-engine-normalize";
import {
  CART_STRATEGIES,
  type BuildOptionsSettings,
  type CartItemInput,
  type CartOption,
  type LocalQuote,
  type Quote,
} from "./types";

/**
 * D-057 (S18): este arquivo tinha 445 linhas. Dividido em `options-engine-normalize.ts` (normalização de itens/
 * ofertas) e `options-engine-assign.ts` (atribuição + as 3 estratégias de escolha entre combinações) — este
 * arquivo continua sendo o ÚNICO ponto de import (`@/features/cart/options-engine`) e reexporta as constantes
 * públicas dos dois irmãos, além de manter `buildCartOptions`.
 *
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
export { BALANCED_WEIGHT_AVAILABILITY, BALANCED_WEIGHT_DELIVERY, BALANCED_WEIGHT_PRICE, BALANCED_WEIGHT_STORES, BALANCED_WEIGHTS, MAX_SUBSET_RETAILERS } from "./options-engine-assign";
export { FUTURE_SKEW_MS } from "./options-engine-normalize";

/** Validade padrão de um preço: 24 h. Além disso ele fica "desatualizado" e sai do total. */
export const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

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
