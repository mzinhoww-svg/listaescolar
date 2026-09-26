import { parsePriceToCents } from "@/features/stationeries/catalog";

import { BILLING_MAX_AMOUNT_CENTS } from "./limits";

/** "R$ 1.234,50" para centavos inteiros; recusa zero, negativo, lixo (`12,5x`), ambíguo e acima do teto da cobrança. */
export function parseBrlToCents(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const cents = parsePriceToCents(input);
  return cents !== null && cents <= BILLING_MAX_AMOUNT_CENTS ? cents : null;
}

/** Centavos inteiros para `R$ 1.234,50` (pt-BR). Nunca ponto flutuante nos cálculos, só na exibição. */
export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
