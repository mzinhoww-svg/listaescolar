/** Entrada da sonda de layout: retângulo de um controle e da área visível do contêiner de rolagem mais próximo. */
export type ActionRect = { label: string; left: number; right: number; clipRight: number; inTable: boolean };
export type TargetRect = { label: string; w: number; h: number };

/**
 * Ações escondidas por tabela larga a 390 px (J7-01, J8-03): controle fora da área visível do contêiner de rolagem
 * (inteiro fora, ou cortado em mais da metade). Quem chama coleta os retângulos no navegador.
 */
export function classifyHiddenActions(entries: readonly ActionRect[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    const width = e.right - e.left;
    if (width <= 0) continue;
    if (e.left >= e.clipRight - 1) out.push(`${e.label} (fora da tela, x=${Math.round(e.left)} de ${Math.round(e.clipRight)})`);
    else if (e.right - e.clipRight > width / 2) out.push(`${e.label} (cortada, ${Math.round(e.right - e.clipRight)} de ${Math.round(width)} px fora)`);
  }
  return out;
}

/** Alvo abaixo de 24 px = P1 (WCAG 2.5.8 AA); de 24 a 43 px = P2 (Ruling da S29). */
export function classifyTargets(entries: readonly TargetRect[]): { p1: string[]; p2: string[]; summary: string } {
  const p1: string[] = [];
  const p2: string[] = [];
  for (const t of entries) {
    if (t.w >= 43.5 && t.h >= 43.5) continue;
    const text = `${t.label} ${Math.round(t.w)}x${Math.round(t.h)}`;
    (Math.min(t.w, t.h) < 24 ? p1 : p2).push(text);
  }
  const summary = [p1.length ? `P1: ${p1.length}` : "", p2.length ? `P2: ${p2.length}` : ""].filter(Boolean).join(", ");
  return { p1, p2, summary };
}
