import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { B2bApiError } from "../../errors";
import { CART_MATCH_MAX_BODY_BYTES, CART_MATCH_MAX_SKUS, CART_MATCH_NAME_LENGTH, CART_MATCH_SKU_LENGTH, CART_MATCH_SKU_PATTERN } from "../../limits";
import { defineEndpoint } from "../contract";
import { matchItems, type MatchableItem } from "../match";

// POST /v1/carts/match — casa SKUs do parceiro com os itens da lista pública (mesma regra de exposição). Sem IA,
// sem preço, sem cart_url, sem persistir o catálogo do parceiro (só contagens agregadas no uso diário).

const SkuInputSchema = z
  .object({
    sku: z.string().min(CART_MATCH_SKU_LENGTH.min).max(CART_MATCH_SKU_LENGTH.max).regex(CART_MATCH_SKU_PATTERN),
    name: z.string().min(CART_MATCH_NAME_LENGTH.min).max(CART_MATCH_NAME_LENGTH.max),
  })
  .strict();

const BodySchema = z
  .object({
    list_id: z.uuid(),
    skus: z.array(SkuInputSchema).min(CART_MATCH_MAX_SKUS.min).max(CART_MATCH_MAX_SKUS.max),
  })
  .strict();

const MatchResponseSchema = z
  .object({
    list_id: z.uuid(),
    version: z.number().int().positive(),
    matched: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    items: z.array(
      z
        .object({
          position: z.number().int().positive(),
          name: z.string(),
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
          match: z.object({ sku: z.string(), method: z.enum(["exact", "tokens"]) }).strict().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

type MatchItemRow = { position: number; name: string; quantity: number | null; unit: string | null };
type ListRow = { id: string; version: number };

export const cartsMatchEndpoint = defineEndpoint(
  {
    id: "carts.match",
    method: "POST",
    path: "/v1/carts/match",
    scope: "carts:match",
    summary: "Casa os SKUs do parceiro com os itens de uma lista pública. Sem preço, sem cart_url, determinístico.",
    bodySchema: BodySchema,
    maxBodyBytes: CART_MATCH_MAX_BODY_BYTES,
    responseSchema: MatchResponseSchema,
    errors: [
      "invalid_key", "insufficient_scope", "not_found", "invalid_request", "payload_too_large",
      "unsupported_media_type", "rate_limited", "service_unavailable", "internal_error",
    ],
    example: {
      request: { list_id: "11111111-1111-4111-8111-111111111111", skus: [{ sku: "CAD-96", name: "Caderno 96 folhas" }] },
      response: {
        list_id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        matched: 1,
        unmatched: 0,
        items: [{ position: 1, name: "Caderno 96 folhas", quantity: 2, unit: "un", match: { sku: "CAD-96", method: "exact" } }],
      },
    },
  },
  async ({ ctx, body }) => {
    const { list_id: listId, skus } = body as z.infer<typeof BodySchema>;
    const admin = createAdminClient();

    const { data: list, error: listError } = await admin.rpc("b2b_v1_list", { p_environment: ctx.key.environment, p_coverage_ufs: ctx.key.coverageUfs, p_list_id: listId });
    if (listError) throw new B2bApiError("internal_error");
    if (!list) throw new B2bApiError("not_found");
    const listRow = list as ListRow;

    const { data, error } = await admin.rpc("b2b_v1_list_match_items", { p_environment: ctx.key.environment, p_coverage_ufs: ctx.key.coverageUfs, p_list_id: listId });
    if (error) throw new B2bApiError("internal_error");
    const rows = (data ?? []) as MatchItemRow[];

    const listItems: MatchableItem[] = rows.map((r) => ({ position: r.position, name: r.name, quantity: r.quantity, unit: r.unit }));
    const result = matchItems(listItems, skus);

    return {
      data: { list_id: listId, version: listRow.version, matched: result.matched, unmatched: result.unmatched, items: result.items },
      usage: { matchTotal: result.items.length, matchMatched: result.matched },
    };
  },
);
