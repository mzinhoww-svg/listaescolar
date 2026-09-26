import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { B2bApiError } from "../../errors";
import { defineEndpoint } from "../contract";
import { SchoolResponseSchema } from "./schools";

// GET /v1/schools/{inep} — mesma regra pública de `schools.list`, uma escola. Fora da cobertura ou inexistente:
// 404 igual (nunca revela se existe fora da cobertura).

const ParamsSchema = z.object({ inep: z.string().regex(/^[0-9]{8}$/) }).strict();

export const schoolEndpoint = defineEndpoint(
  {
    id: "schools.get",
    method: "GET",
    path: "/v1/schools/{inep}",
    scope: "schools:read",
    summary: "Uma escola visível a esta chave, pelo INEP.",
    paramsSchema: ParamsSchema,
    responseSchema: SchoolResponseSchema,
    errors: ["invalid_key", "insufficient_scope", "not_found", "invalid_request", "rate_limited", "service_unavailable", "internal_error"],
    example: {
      request: { inep: "51999901" },
      response: {
        inep: "51999901",
        name: "Escola Municipal Exemplo",
        network: "municipal",
        neighborhood: "Centro",
        municipality: { ibge_code: "5103403", name: "Cuiabá", uf: "MT" },
        verified: true,
        published_lists_count: 3,
        is_demo: false,
      },
    },
  },
  async ({ ctx, params }) => {
    const { inep } = params as z.infer<typeof ParamsSchema>;
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("b2b_v1_school", { p_environment: ctx.key.environment, p_coverage_ufs: ctx.key.coverageUfs, p_inep: inep });
    if (error) throw new B2bApiError("internal_error");
    if (!data) throw new B2bApiError("not_found");
    return { data };
  },
);
