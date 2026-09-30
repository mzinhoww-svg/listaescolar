import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { B2bApiError } from "../../errors";
import { SCHOOLS_LIST_LIMIT, SCHOOL_QUERY_LENGTH } from "../../limits";
import { defineEndpoint } from "../contract";
import { decodeCursor, encodeCursor } from "../cursor";

// GET /v1/schools — escolas com listas publicadas visíveis à chave (ambiente + cobertura por UF), filtráveis por
// município, UF, texto e presença de listas. Whitelist (Global Constraints): inep, name, network, neighborhood,
// municipality{ibge_code,name,uf}, verified, published_lists_count, is_demo.

export const MunicipalitySchema = z.object({ ibge_code: z.string(), name: z.string(), uf: z.string() }).strict();

export const SchoolResponseSchema = z
  .object({
    inep: z.string().regex(/^[0-9]{8}$/),
    name: z.string(),
    network: z.string(),
    neighborhood: z.string().nullable(),
    municipality: MunicipalitySchema,
    verified: z.boolean(),
    published_lists_count: z.number().int().nonnegative(),
    is_demo: z.boolean(),
  })
  .strict();

const SchoolsQuerySchema = z
  .object({
    city: z.string().regex(/^[0-9]{7}$/).optional().describe("Código IBGE do município (7 dígitos)."),
    uf: z.string().length(2).optional().describe("Sigla da UF, por exemplo MT."),
    q: z.string().min(SCHOOL_QUERY_LENGTH.min).max(SCHOOL_QUERY_LENGTH.max).optional().describe("Parte do nome da escola."),
    has_lists: z.enum(["true", "false"]).optional().describe("Filtra escolas com lista publicada."),
    limit: z.coerce.number().int().min(1).max(SCHOOLS_LIST_LIMIT.max).optional().describe("Quantidade de escolas por página."),
    cursor: z.string().optional().describe("Cursor devolvido na página anterior (next_cursor)."),
  })
  .strict();

const SchoolsCursorSchema = z.object({ name: z.string(), inep: z.string() }).strict();

type SchoolRow = {
  inep: string;
  name: string;
  network: string;
  neighborhood: string | null;
  municipality: { ibge_code: string; name: string; uf: string };
  verified: boolean;
  published_lists_count: number;
  is_demo: boolean;
};

/** `normalized_name` real da escola (não sai na resposta): só para continuar a paginação por keyset no lookup
 * seguinte, na mesma ordem que a função pública usa internamente. */
async function normalizedNameOfSchool(admin: ReturnType<typeof createAdminClient>, inep: string): Promise<string> {
  const { data, error } = await admin.from("schools").select("normalized_name").eq("inep", inep).single();
  if (error || !data) throw new B2bApiError("internal_error");
  return (data as { normalized_name: string }).normalized_name;
}

export const schoolsEndpoint = defineEndpoint(
  {
    id: "schools.list",
    method: "GET",
    path: "/v1/schools",
    scope: "schools:read",
    summary: "Lista escolas com listas publicadas visíveis a esta chave, com filtros e paginação por cursor.",
    querySchema: SchoolsQuerySchema,
    responseSchema: z.array(SchoolResponseSchema),
    errors: ["invalid_key", "insufficient_scope", "invalid_request", "rate_limited", "service_unavailable", "internal_error"],
    example: {
      request: { uf: "MT", limit: 50 },
      response: [
        {
          inep: "51999901",
          name: "Escola Municipal Exemplo",
          network: "municipal",
          neighborhood: "Centro",
          municipality: { ibge_code: "5103403", name: "Cuiabá", uf: "MT" },
          verified: true,
          published_lists_count: 3,
          is_demo: false,
        },
      ],
    },
  },
  async ({ ctx, query }) => {
    const q = query as z.infer<typeof SchoolsQuerySchema>;
    let after: { name: string; inep: string } | null = null;
    if (q.cursor) {
      after = decodeCursor(q.cursor, SchoolsCursorSchema);
      if (!after) throw new B2bApiError("invalid_request", undefined, [{ path: "query.cursor", code: "invalid_cursor" }]);
    }
    const limit = q.limit ?? SCHOOLS_LIST_LIMIT.default;
    const admin = createAdminClient();
    // Achado D (revisão de segurança independente, rodada 2): `.abortSignal()` encaminha o timeout do pipeline até
    // o `fetch` do PostgREST — sem isso, a consulta continuava rodando em segundo plano depois do 503.
    let rpcQuery = admin.rpc("b2b_v1_schools", {
      p_environment: ctx.key.environment,
      p_coverage_ufs: ctx.key.coverageUfs,
      p_city: q.city ?? null,
      p_uf: q.uf ?? null,
      p_q: q.q ?? null,
      p_has_lists: q.has_lists === undefined ? null : q.has_lists === "true",
      p_after_name: after?.name ?? null,
      p_after_inep: after?.inep ?? null,
      p_limit: limit,
    });
    if (ctx.signal) rpcQuery = rpcQuery.abortSignal(ctx.signal);
    const { data, error } = await rpcQuery;
    if (error) throw new B2bApiError("internal_error");
    const rows = (data ?? []) as SchoolRow[];

    let nextCursor: string | null = null;
    if (rows.length === limit) {
      const last = rows.at(-1)!;
      const normalizedName = await normalizedNameOfSchool(admin, last.inep);
      nextCursor = encodeCursor({ name: normalizedName, inep: last.inep });
    }
    return { data: rows, nextCursor };
  },
);
