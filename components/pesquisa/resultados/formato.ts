/** Fração 0..1 para percentual inteiro, ex.: 0.4321 -> "43%". */
export function formatarPercentual(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}

/** Segundos para "m:ss"; "—" quando não há mediana (nenhuma resposta completa). */
export function formatarTempoMinutoSegundo(segundos: number | null): string {
  if (segundos === null) return "—";
  const total = Math.max(0, Math.round(segundos));
  const minutos = Math.floor(total / 60);
  const restante = total % 60;
  return `${minutos}:${String(restante).padStart(2, "0")}`;
}
