/** Telefone só com dígitos (DDD + número) para exibição; formato inesperado volta como veio. */
export function formatPhone(digits: string): string {
  const m10 = /^(\d{2})(\d{4})(\d{4})$/.exec(digits);
  if (m10) return `(${m10[1]}) ${m10[2]}-${m10[3]}`;
  const m11 = /^(\d{2})(\d{5})(\d{4})$/.exec(digits);
  if (m11) return `(${m11[1]}) ${m11[2]}-${m11[3]}`;
  return digits;
}

const SKIP = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Iniciais (até 2) das primeiras palavras significativas, para a marca do card. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !SKIP.has(w.toLowerCase()));
  const letters = words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return letters || "E";
}

/** "1 escola encontrada" / "N escolas encontradas". */
export function foundLabel(total: number): string {
  return total === 1 ? "1 escola encontrada" : `${total.toLocaleString("pt-BR")} escolas encontradas`;
}
