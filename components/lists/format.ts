const TZ = "America/Cuiaba";

/** Data curta (dd/mm/aaaa) no fuso do piloto; entrada inválida vira "indisponível". */
export function formatListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Quantidade em pt-BR (12,5); null quando a lista não informa. */
export function formatQuantity(q: number | null, unit: string | null): string | null {
  if (q === null) return null;
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(q);
  return unit ? `${n} ${unit}` : n;
}

export function itemCountLabel(n: number): string {
  return n === 1 ? "1 item" : `${n} itens`;
}
