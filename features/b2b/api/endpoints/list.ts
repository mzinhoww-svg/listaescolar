import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { B2bApiError } from "../../errors";
import { defineEndpoint } from "../contract";
import { ListResponseSchema } from "./school-lists";

// GET /v1/lists/{id} — mesma regra pública; só a versão atual publicada. Fora da cobertura, ambiente errado,
// versão superseded ou lista não publicada: 404 igual a inexistente.

const ParamsSchema = z.object({ id: z.uuid().describe("Identificador da lista.") }).strict();

export const listEndpoint = defineEndpoint(
  {
    id: "lists.get",
    method: "GET",
    path: "/v1/lists/{id}",
    scope: "lists:read",
    summary: "Uma lista publicada visível a esta chave, pelo id.",
    paramsSchema: ParamsSchema,
    responseSchema: ListResponseSchema,
    errors: ["invalid_key", "insufficient_scope", "not_found", "invalid_request", "rate_limited", "service_unavailable", "internal_error"],
    example: {
      request: { id: "11111111-1111-4111-8111-111111111111" },
      response: { id: "11111111-1111-4111-8111-111111111111", school_inep: "51999901", grade: { slug: "ef-1", name: "1º ano", stage: "ef1" }, school_year: 2027, version: 1, published_at: "2026-09-01T12:00:00Z", item_count: 8, is_demo: false },
    },
  },
  async ({ ctx, params }) => {
    const { id } = params as z.infer<typeof ParamsSchema>;
    const admin = createAdminClient();
    // Achado D (revisão de segurança independente, rodada 2): ver o mesmo comentário em `schools.ts`.
    let query = admin.rpc("b2b_v1_list", { p_environment: ctx.key.environment, p_coverage_ufs: ctx.key.coverageUfs, p_list_id: id });
    if (ctx.signal) query = query.abortSignal(ctx.signal);
    const { data, error } = await query;
    if (error) throw new B2bApiError("internal_error");
    if (!data) throw new B2bApiError("not_found");
    return { data };
  },
);
