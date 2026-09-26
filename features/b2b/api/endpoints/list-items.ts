import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { B2bApiError } from "../../errors";
import { LIST_ITEMS_LIMIT } from "../../limits";
import { defineEndpoint } from "../contract";
import { decodeCursor, encodeCursor } from "../cursor";

// GET /v1/lists/{id}/items — itens da versão atual publicada. Whitelist: position, name (original_name),
// normalized_name, category, quantity, unit. Cursor por `position` (já está na resposta, sem lookup extra).

export const ItemResponseSchema = z
  .object({
    position: z.number().int().positive(),
    name: z.string(),
    normalized_name: z.string(),
    category: z.string().nullable(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
  })
  .strict();

const ParamsSchema = z.object({ id: z.uuid() }).strict();
const QuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(LIST_ITEMS_LIMIT.max).optional(),
    cursor: z.string().optional(),
  })
  .strict();
const ItemsCursorSchema = z.object({ position: z.number().int() }).strict();

type ItemRow = z.infer<typeof ItemResponseSchema>;

export const listItemsEndpoint = defineEndpoint(
  {
    id: "lists.items",
    method: "GET",
    path: "/v1/lists/{id}/items",
    scope: "lists:read",
    summary: "Itens de uma lista publicada visível a esta chave, em ordem de posição.",
    paramsSchema: ParamsSchema,
    querySchema: QuerySchema,
    responseSchema: z.array(ItemResponseSchema),
    errors: ["invalid_key", "insufficient_scope", "not_found", "invalid_request", "rate_limited", "service_unavailable", "internal_error"],
    example: {
      request: { id: "11111111-1111-4111-8111-111111111111" },
      response: [{ position: 1, name: "Caderno 96 folhas", normalized_name: "caderno 96 folhas", category: "papelaria", quantity: 2, unit: "un" }],
    },
  },
  async ({ ctx, params, query }) => {
    const { id } = params as z.infer<typeof ParamsSchema>;
    const q = query as z.infer<typeof QuerySchema>;
    const admin = createAdminClient();

    const { data: list, error: listError } = await admin.rpc("b2b_v1_list", { p_environment: ctx.key.environment, p_coverage_ufs: ctx.key.coverageUfs, p_list_id: id });
    if (listError) throw new B2bApiError("internal_error");
    if (!list) throw new B2bApiError("not_found");

    let after: { position: number } | null = null;
    if (q.cursor) {
      after = decodeCursor(q.cursor, ItemsCursorSchema);
      if (!after) throw new B2bApiError("invalid_request", undefined, [{ path: "query.cursor", code: "invalid_cursor" }]);
    }
    const limit = q.limit ?? LIST_ITEMS_LIMIT.default;
    const { data, error } = await admin.rpc("b2b_v1_list_items", {
      p_environment: ctx.key.environment,
      p_coverage_ufs: ctx.key.coverageUfs,
      p_list_id: id,
      p_after_position: after?.position ?? null,
      p_limit: limit,
    });
    if (error) throw new B2bApiError("internal_error");
    const rows = (data ?? []) as ItemRow[];

    const nextCursor = rows.length === limit ? encodeCursor({ position: rows.at(-1)!.position }) : null;
    return { data: rows, nextCursor };
  },
);
