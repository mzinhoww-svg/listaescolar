import { parsePriceToCents } from "@/features/stationeries/catalog";

/** Teto do banco para valor informado/declarado: R$ 100.000,00. */
export const LEAD_MAX_AMOUNT_CENTS = 10_000_000;

/** "R$ 1.234,50" para centavos inteiros; recusa zero, negativo, lixo, ambíguo e acima do teto do banco. */
export function parseBrlToCents(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const cents = parsePriceToCents(input);
  return cents !== null && cents <= LEAD_MAX_AMOUNT_CENTS ? cents : null;
}
