import { z } from "zod";

import { normalizeItemKey } from "@/features/cart/item-key";

/** Chave do item do catálogo: a mesma normalização do carrinho (S12). */
export function catalogItemKey(name: string): string {
  return normalizeItemKey(name);
}

export const CATALOG_PRICE_SOURCE = "informed_by_stationery";
export const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00, igual ao check do banco
export const CATALOG_STOCK = ["in_stock", "out_of_stock", "unknown"] as const;
export type CatalogStock = (typeof CATALOG_STOCK)[number];

/**
 * Preço em centavos a partir de texto: `12,50`, `12.50`, `1.234,50`, `R$ 12,50`, `12`.
 * Rejeita zero, negativo, mais de 2 decimais, lixo (`12,5x`) e valor acima do limite.
 */
export function parsePriceToCents(input: string): number | null {
  const s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  const m =
    /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s) ?? // 12 | 12,5 | 12.50
    /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(s) ?? // 1.234,50 | 1.234.567
    /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(s); // 1,234.50 | 1,234,567
  // "1.234" e "12,505" (um só separador seguido de 3 dígitos) são ambíguos: recusados, não adivinhados.
  if (m && m[2] === undefined && /^\d{1,3}[.,]\d{3}$/.test(s)) return null;
  if (!m?.[1]) return null;
  const whole = m[1].replace(/[.,]/g, "");
  if (whole.length > 10) return null;
  const cents = Number(whole) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

/** `sim`/`nao`/vazio (também `não`, `s`, `n`) para o estoque informado. */
export function parseStockAnswer(input: string): CatalogStock | null {
  const v = input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLowerCase();
  if (v === "") return "unknown";
  if (v === "sim" || v === "s") return "in_stock";
  if (v === "nao" || v === "n") return "out_of_stock";
  return null;
}

export const CatalogItemInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do item.")
    .max(200, "Nome com até 200 caracteres.")
    .refine((n) => catalogItemKey(n) !== "", "Nome inválido."),
  priceCents: z
    .number()
    .int("Preço em centavos.")
    .positive("O preço deve ser maior que zero.")
    .max(MAX_PRICE_CENTS, "Preço acima do limite."),
  stock: z.enum(CATALOG_STOCK).default("unknown"),
});
export type CatalogItemInput = z.input<typeof CatalogItemInputSchema>;
export type CatalogItem = z.output<typeof CatalogItemInputSchema>;

/** Neutraliza célula de planilha que o Excel/Sheets interpretaria como fórmula. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
export function startsWithFormula(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value.trimStart());
}
