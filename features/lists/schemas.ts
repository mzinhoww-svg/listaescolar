import { z } from "zod";

/** Códigos de alerta do spec §6. Sinalizações internas para revisão, nunca parecer jurídico. */
export const ALERT_CODES = [
  "low_confidence_item",
  "ambiguous_item",
  "handwritten",
  "possible_collective_item",
  "restrictive_brand_or_spec",
  "text_document_mismatch",
  "invalid_school_grade_year",
] as const;
export const alertCodeSchema = z.enum(ALERT_CODES);
export type AlertCode = z.infer<typeof alertCodeSchema>;

export const MAX_QUANTITY = 99_999_999.99; // numeric(10,2)

/** Minúsculas, sem acento, só [a-z0-9] separados por um espaço. */
export function normalizeItemName(s: string): string {
  return s
    .replace(/[ºª°]/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const quantitySchema = z.union([z.number(), z.string()]).transform((v, ctx) => {
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const t = v.trim();
    n = /^\d+([.,]\d{1,2})?$/.test(t) ? Number(t.replace(",", ".")) : Number.NaN;
  }
  if (!Number.isFinite(n) || n <= 0 || n > MAX_QUANTITY || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    ctx.addIssue({ code: "custom", message: "quantidade inválida" });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});

export const itemInputSchema = z
  .object({
    originalName: z.string().trim().min(1).max(500),
    normalizedName: z.string().trim().min(1).max(500).optional(),
    category: z.string().trim().min(1).max(100).nullish(),
    quantity: quantitySchema.nullish(),
    unit: z.string().trim().min(1).max(30).nullish(),
    confidence: z.number().min(0).max(1).nullish(),
    alerts: z.array(alertCodeSchema).max(20).default([]),
  })
  .transform((v, ctx) => {
    const normalizedName = v.normalizedName ?? normalizeItemName(v.originalName);
    if (normalizedName.length === 0) {
      ctx.addIssue({ code: "custom", message: "nome sem letras ou números", path: ["originalName"] });
      return z.NEVER;
    }
    return {
      originalName: v.originalName,
      normalizedName,
      category: v.category ?? null,
      quantity: v.quantity ?? null,
      unit: v.unit ?? null,
      confidence: v.confidence ?? null,
      alerts: v.alerts,
    };
  });

export type ItemInput = z.input<typeof itemInputSchema>;
export type ParsedItem = z.output<typeof itemInputSchema>;

export const itemsInputSchema = z.array(itemInputSchema).min(1).max(500);
