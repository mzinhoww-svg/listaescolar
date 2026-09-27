import { randomUUID } from "node:crypto";

import { buildOpenApi } from "@/features/b2b/api/openapi";
import { ENDPOINTS } from "@/features/b2b/api/endpoints";

// GET /v1/openapi.json — público (sem chave, sem dado pessoal): o próprio contrato, documento gerado do registro
// de endpoints. `Cache-Control: public, max-age=300` (Global Constraints), diferente do `no-store` das rotas
// autenticadas.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const document = buildOpenApi(ENDPOINTS);
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": randomUUID(),
  });
  return new Response(JSON.stringify(document), { status: 200, headers });
}

export function POST(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET" } });
}
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
