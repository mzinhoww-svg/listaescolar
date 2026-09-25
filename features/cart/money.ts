// Dinheiro: sempre centavos inteiros (number seguro). Nada de float; overflow vira null, nunca valor errado.

export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** unit * qty em centavos; null se sair do intervalo seguro. */
export function mulCents(unitCents: number, quantity: number): number | null {
  if (!isCents(unitCents) || !isQuantity(quantity)) return null;
  const product = unitCents * quantity;
  return Number.isSafeInteger(product) ? product : null;
}

/** Soma em centavos; null se algum termo for inválido ou a soma sair do intervalo seguro. */
export function sumCents(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/** "R$ 1.234,56" a partir de centavos inteiros (sem float). */
export function formatBRL(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("centavos inválidos");
  const reais = Math.trunc(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac}`;
}
