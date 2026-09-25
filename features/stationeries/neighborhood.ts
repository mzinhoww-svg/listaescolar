/** Texto de exibição do bairro: só arruma espaços (mantém caixa e acentos). */
export function neighborhoodLabel(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Chave do bairro: a ÚNICA normalização (áreas gravadas, cotação local, comparação dos dois lados).
 * Sem acento, minúscula, espaços únicos: "São José" e "sao  jose" são o mesmo bairro.
 */
export function normalizeNeighborhood(name: string): string {
  return neighborhoodLabel(name)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}
