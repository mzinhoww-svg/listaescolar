export type ModeFilter = { entrega: boolean; retirada: boolean };

/** Filtros reais (Entrega, Retirada): cada filtro ligado exige que a papelaria ofereça a modalidade. */
export function filterByMode<T extends { offersDelivery: boolean; offersPickup: boolean }>(options: readonly T[], f: ModeFilter): T[] {
  return options.filter((o) => (!f.entrega || o.offersDelivery) && (!f.retirada || o.offersPickup));
}

/** Monta `/cotacao/nova?...` só com chaves conhecidas e valores não vazios. */
export function novaHref(params: { carrinho: string; papelaria?: string; bairro?: string; entrega?: boolean; retirada?: boolean; erro?: string }): string {
  const q = new URLSearchParams({ carrinho: params.carrinho });
  if (params.papelaria) q.set("papelaria", params.papelaria);
  if (params.bairro) q.set("bairro", params.bairro);
  if (params.entrega) q.set("entrega", "1");
  if (params.retirada) q.set("retirada", "1");
  if (params.erro) q.set("erro", params.erro);
  return `/cotacao/nova?${q.toString()}`;
}
