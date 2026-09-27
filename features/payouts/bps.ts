/** "10,00" (%) -> 1000 (basis points). Recusa negativo, lixo e acima de 100%. */
export function parsePercentToBps(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const bps = Math.round(Number(normalized) * 100);
  return bps >= 0 && bps <= 10000 ? bps : null;
}

/** 1000 -> "10,00" (para preencher o formulário). */
export function formatBpsAsPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(".", ",");
}
