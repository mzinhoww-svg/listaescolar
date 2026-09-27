import { randomUUID } from "node:crypto";

import { apiError } from "@/features/b2b/api/envelope";

// Catch-all de `/v1/**`: qualquer caminho fora do registro de endpoints (e fora de `/v1/openapi.json`) é 404
// padrão, sem tocar chave, escopo ou banco — a rota simplesmente não existe.

export const dynamic = "force-dynamic";

function notFound(): Response {
  const requestId = randomUUID();
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  });
  return new Response(JSON.stringify(apiError("not_found", requestId)), { status: 404, headers });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
