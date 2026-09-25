import { z } from "zod";

import { normalizeItemKey } from "./item-key";
import { CART_STRATEGIES } from "./types";

export const cartItemInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10_000),
  })
  .transform((v) => ({ itemKey: normalizeItemKey(v.name), name: v.name, quantity: v.quantity }))
  .pipe(z.object({ itemKey: z.string().min(1), name: z.string(), quantity: z.number() }));

export const createCartSchema = z.object({
  listId: z.uuid(),
  strategy: z.enum(CART_STRATEGIES).default("cheapest"),
});

export const redirectParamsSchema = z.object({
  cartId: z.uuid(),
  retailer: z.string().regex(/^[a-z0-9-]{1,40}$/),
});

/** Linha de price_snapshots (com o slug do varejista) vinda do banco. */
export const snapshotRowSchema = z.object({
  retailerSlug: z.string().min(1),
  itemKey: z.string().min(1),
  priceCents: z.number().int().positive(),
  source: z.string().trim().min(1),
  // Sem coerce: null/undefined virariam 1970. Aceita Date válido ou ISO-8601 com offset (timestamptz).
  checkedAt: z.union([
    z.date().refine((d) => !Number.isNaN(d.getTime())),
    z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  ]),
  productUrl: z.string().nullable(),
  isDemo: z.boolean(),
});
export type SnapshotRow = z.infer<typeof snapshotRowSchema>;

export const retailerRowSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  searchUrlTemplate: z.string().min(1),
  affiliateKind: z.enum(["none", "mercadolivre", "amazon"]),
  isActive: z.boolean(),
});
export type RetailerRow = z.infer<typeof retailerRowSchema>;

export const chooseOptionSchema = z.object({
  cartId: z.uuid(),
  strategy: z.enum(CART_STRATEGIES),
});
