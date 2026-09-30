import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { B2bApiError } from "../../errors";
import { SCHOOL_LISTS_LIMIT } from "../../limits";
import { defineEndpoint } from "../contract";
import { decodeCursor, encodeCursor } from "../cursor";

// GET /v1/schools/{inep}/lists?year=<2020..2100> — listas publicadas da escola, visíveis a esta chave. Whitelist:
// id, school_inep, grade{slug,name,stage}, school_year, version, published_at, item_count, is_demo.

export const GradeResponseSchema = z.object({ slug: z.string(), name: z.string(), stage: z.string() }).strict();

export const ListResponseSchema = z
  .object({
    id: z.uuid(),
    school_inep: z.string().regex(/^[0-9]{8}$/),
    grade: GradeResponseSchema,
    school_year: z.number().int(),
    version: z.number().int().positive(),
    published_at: z.string(),
    item_count: z.number().int().nonnegative(),
    is_demo: z.boolean(),
  })
  .strict();

const ParamsSchema = z.object({ inep: z.string().regex(/^[0-9]{8}$/).describe("Código INEP da escola (8 dígitos).") }).strict();
const QuerySchema = z
  .object({
    year: z.coerce.number().int().min(2020).max(2100).optional().describe("Ano letivo da lista."),
    limit: z.coerce.number().int().min(1).max(SCHOOL_LISTS_LIMIT.max).optional().describe("Quantidade de listas por página."),
    cursor: z.string().optional().describe("Cursor devolvido na página anterior (next_cursor)."),
  })
  .strict();
const ListsCursorSchema = z.object({ year: z.number().int(), sort: z.number().int(), id: z.uuid() }).strict();

type ListRow = z.infer<typeof ListResponseSchema>;

/** `sort_order` real da série (não sai na resposta): só para continuar a paginação por keyset. */
async function sortOrderOfGrade(admin: ReturnType<typeof createAdminClient>, slug: string): Promise<number> {
  const { data, error } = await admin.from("grades").select("sort_order").eq("slug", slug).single();
  if (error || !data) throw new B2bApiError("internal_error");
  return (data as { sort_order: number }).sort_order;
}

export const schoolListsEndpoint = defineEndpoint(
  {
    id: "schools.lists",
    method: "GET",
    path: "/v1/schools/{inep}/lists",
    scope: "lists:read",
    summary: "Listas publicadas de uma escola, visíveis a esta chave.",
    paramsSchema: ParamsSchema,
    querySchema: QuerySchema,
    responseSchema: z.array(ListResponseSchema),
    errors: ["invalid_key", "insufficient_scope", "not_found", "invalid_request", "rate_limited", "service_unavailable", "internal_error"],
    example: {
      request: { inep: "51999901", year: 2027 },
      response: [
        { id: "11111111-1111-4111-8111-111111111111", school_inep: "51999901", grade: { slug: "ef-1", name: "1º ano", stage: "ef1" }, school_year: 2027, version: 1, published_at: "2026-09-01T12:00:00Z", item_count: 8, is_demo: false },
      ],
    },
  },
  async ({ ctx, params, query }) => {
    const { inep } = params as z.infer<typeof ParamsSchema>;
    const q = query as z.infer<typeof QuerySchema>;
    const admin = createAdminClient();

    // Achado D (revisão de segurança independente, rodada 2): as DUAS chamadas RPC deste endpoint recebem o
    // `AbortSignal` — ver o mesmo comentário em `schools.ts`.
    let schoolQuery = admin.rpc("b2b_v1_school", {
      p_environment: ctx.key.environment,
      p_coverage_ufs: ctx.key.coverageUfs,
      p_inep: inep,
    });
    if (ctx.signal) schoolQuery = schoolQuery.abortSignal(ctx.signal);
    const { data: school, error: schoolError } = await schoolQuery;
    if (schoolError) throw new B2bApiError("internal_error");
    if (!school) throw new B2bApiError("not_found");

    let after: { year: number; sort: number; id: string } | null = null;
    if (q.cursor) {
      after = decodeCursor(q.cursor, ListsCursorSchema);
      if (!after) throw new B2bApiError("invalid_request", undefined, [{ path: "query.cursor", code: "invalid_cursor" }]);
    }
    const limit = q.limit ?? SCHOOL_LISTS_LIMIT.default;
    let listsQuery = admin.rpc("b2b_v1_school_lists", {
      p_environment: ctx.key.environment,
      p_coverage_ufs: ctx.key.coverageUfs,
      p_inep: inep,
      p_year: q.year ?? null,
      p_after_year: after?.year ?? null,
      p_after_sort: after?.sort ?? null,
      p_after_id: after?.id ?? null,
      p_limit: limit,
    });
    if (ctx.signal) listsQuery = listsQuery.abortSignal(ctx.signal);
    const { data, error } = await listsQuery;
    if (error) throw new B2bApiError("internal_error");
    const rows = (data ?? []) as ListRow[];

    let nextCursor: string | null = null;
    if (rows.length === limit) {
      const last = rows.at(-1)!;
      const sort = await sortOrderOfGrade(admin, last.grade.slug);
      nextCursor = encodeCursor({ year: last.school_year, sort, id: last.id });
    }
    return { data: rows, nextCursor };
  },
);
