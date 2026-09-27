import { BILLING_MAX_AMOUNT_CENTS, BILLING_MIN_AMOUNT_CENTS } from "./limits";

export type PriceTier = { minItems: number; maxItems: number | null; priceCents: number };

/** Faixa que contém `itemCount`, ou `null` (não deveria acontecer com faixas válidas cobrindo 1..300). */
export function tierFor(tiers: readonly PriceTier[], itemCount: number): PriceTier | null {
  return tiers.find((t) => itemCount >= t.minItems && (t.maxItems === null || itemCount <= t.maxItems)) ?? null;
}

export type TierValidationError =
  | "empty"
  | "not_starting_at_one"
  | "max_before_min"
  | "gap_or_overlap"
  | "open_before_last"
  | "last_not_open"
  | "price_out_of_range";
export type TierValidation = { ok: true } | { ok: false; reason: TierValidationError };

/**
 * Mesmas regras de `billing_plan_publish` (0401_billing.sql): faixas ordenadas por `minItems`, contíguas de 1 até
 * aberta (só a última sem `maxItems`), sem buraco nem sobreposição, preço em `[1, 10_000_000]` centavos.
 */
export function validateTiers(tiers: readonly PriceTier[]): TierValidation {
  if (tiers.length < 1) return { ok: false, reason: "empty" };
  const sorted = [...tiers].sort((a, b) => a.minItems - b.minItems);
  let prevMax: number | null = null;
  for (const [i, t] of sorted.entries()) {
    if (t.priceCents < BILLING_MIN_AMOUNT_CENTS || t.priceCents > BILLING_MAX_AMOUNT_CENTS) {
      return { ok: false, reason: "price_out_of_range" };
    }
    if (t.maxItems !== null && t.maxItems < t.minItems) return { ok: false, reason: "max_before_min" };
    if (i === 0 && t.minItems !== 1) return { ok: false, reason: "not_starting_at_one" };
    if (i > 0 && t.minItems !== (prevMax as number) + 1) return { ok: false, reason: "gap_or_overlap" };
    const isLast = i === sorted.length - 1;
    if (!isLast && t.maxItems === null) return { ok: false, reason: "open_before_last" };
    if (isLast && t.maxItems !== null) return { ok: false, reason: "last_not_open" };
    prevMax = t.maxItems;
  }
  return { ok: true };
}
