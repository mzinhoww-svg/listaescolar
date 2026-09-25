import { NETWORK_PARAMS, type SearchInput } from "./types";

const PARAM_OF_NETWORK = Object.fromEntries(Object.entries(NETWORK_PARAMS).map(([k, v]) => [v, k]));

/** Query string canônica da busca (para paginação e links); omite o que é padrão. */
export function buildSearchQuery(input: SearchInput, overrides: { page?: number } = {}): string {
  const p = new URLSearchParams();
  if (input.q) p.set("q", input.q);
  if (input.network) p.set("rede", PARAM_OF_NETWORK[input.network] ?? "");
  if (input.neighborhood) p.set("bairro", input.neighborhood);
  if (input.municipalityId) p.set("municipio", input.municipalityId);
  const page = overrides.page ?? input.page;
  if (page > 1) p.set("pagina", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** true quando a busca tem qualquer filtro ou página > 1 (não deve ser indexada). */
export function isFilteredSearch(input: SearchInput): boolean {
  return Boolean(input.q || input.network || input.neighborhood || input.municipalityId || input.page > 1);
}
