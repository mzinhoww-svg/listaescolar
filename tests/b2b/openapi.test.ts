import { describe, expect, it } from "vitest";

import { ENDPOINTS } from "@/features/b2b/api/endpoints";
import { buildOpenApi } from "@/features/b2b/api/openapi";

describe("buildOpenApi", () => {
  const doc = buildOpenApi(ENDPOINTS);

  it("contém os 6 endpoints (um path por rota, um método por endpoint)", () => {
    const operationIds = Object.values(doc.paths).flatMap((methods) => Object.values(methods).map((op: unknown) => (op as { operationId: string }).operationId));
    expect(new Set(operationIds)).toEqual(new Set(ENDPOINTS.map((e) => e.entry.id)));
  });

  it("declara o securityScheme x-listacerta-key", () => {
    expect(doc.components.securitySchemes["x-listacerta-key"]).toEqual({ type: "apiKey", in: "header", name: "x-listacerta-key" });
    expect(doc.security).toEqual([{ "x-listacerta-key": [] }]);
  });

  it("toda operação declara os cabeçalhos de limite na resposta 200", () => {
    for (const methods of Object.values(doc.paths)) {
      for (const op of Object.values(methods) as { responses: Record<string, unknown> }[]) {
        const ok = op.responses["200"] as { headers: Record<string, unknown> };
        expect(ok.headers).toHaveProperty("X-RateLimit-Limit");
        expect(ok.headers).toHaveProperty("X-RateLimit-Remaining");
        expect(ok.headers).toHaveProperty("X-RateLimit-Reset");
      }
    }
  });

  it("toda operação declara os erros do próprio endpoint com mensagem fixa", () => {
    for (const { entry } of ENDPOINTS) {
      const methods = doc.paths[entry.path]!;
      const op = methods[entry.method.toLowerCase()] as { responses: Record<string, { description: string }> };
      for (const code of entry.errors) {
        expect(op.responses).toHaveProperty(String({ invalid_key: 401, insufficient_scope: 403, not_found: 404, invalid_request: 400, payload_too_large: 413, unsupported_media_type: 415, method_not_allowed: 405, rate_limited: 429, service_unavailable: 503, internal_error: 500 }[code]));
      }
    }
  });

  it("o exemplo é marcado como ilustrativo, nunca como dado real", () => {
    for (const methods of Object.values(doc.paths)) {
      for (const op of Object.values(methods) as { responses: Record<string, unknown> }[]) {
        const ok = op.responses["200"] as { content: { "application/json": { example: { note: string } } } };
        expect(ok.content["application/json"].example.note.toLowerCase()).toContain("ilustrativo");
      }
    }
  });

  it("é puro e determinístico (mesma entrada, mesmo documento)", () => {
    expect(buildOpenApi(ENDPOINTS)).toEqual(buildOpenApi(ENDPOINTS));
  });

  it("openapi 3.1 com título e versão v1", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.version).toBe("v1");
  });
});
