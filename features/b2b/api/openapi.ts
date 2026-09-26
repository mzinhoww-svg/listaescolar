import { z } from "zod";

import { B2B_API_ERROR_STATUS } from "../errors";
import { B2B_API_MESSAGE } from "../messages";
import type { Endpoint } from "./contract";

// `GET /v1/openapi.json` (público, sem chave, sem dado): documento gerado do próprio contrato — endpoints,
// parâmetros, esquemas, escopos, erros, cabeçalhos de limite e um exemplo ilustrativo (marcado como exemplo,
// validado contra o próprio esquema em teste). Nunca à mão: a mesma fonte que valida a resposta documenta a resposta.

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: readonly { url: string }[];
  security: readonly Record<string, readonly string[]>[];
  components: {
    securitySchemes: { "x-listacerta-key": { type: "apiKey"; in: "header"; name: "x-listacerta-key" } };
    schemas: Record<string, unknown>;
  };
  paths: Record<string, Record<string, unknown>>;
};

const RATE_LIMIT_HEADERS = {
  "X-RateLimit-Limit": { description: "Limite da janela mais restritiva.", schema: { type: "integer" } },
  "X-RateLimit-Remaining": { description: "Requisições restantes na janela.", schema: { type: "integer" } },
  "X-RateLimit-Reset": { description: "Epoch (segundos) do fim da janela.", schema: { type: "integer" } },
} as const;

function jsonSchemaOf(schema: z.ZodTypeAny | undefined): unknown {
  if (!schema) return undefined;
  return z.toJSONSchema(schema, { target: "draft-2020-12" });
}

export function buildOpenApi(endpoints: readonly Endpoint[]): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const { entry } of endpoints) {
    const method = entry.method.toLowerCase();
    paths[entry.path] ??= {};
    const parameters: unknown[] = [];
    if (entry.paramsSchema) {
      const schema = z.toJSONSchema(entry.paramsSchema, { target: "draft-2020-12" }) as { properties?: Record<string, unknown> };
      for (const name of Object.keys(schema.properties ?? {})) {
        parameters.push({ name, in: "path", required: true, schema: schema.properties![name] });
      }
    }
    if (entry.querySchema) {
      const schema = z.toJSONSchema(entry.querySchema, { target: "draft-2020-12" }) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      for (const name of Object.keys(schema.properties ?? {})) {
        parameters.push({ name, in: "query", required: (schema.required ?? []).includes(name), schema: schema.properties![name] });
      }
    }
    paths[entry.path]![method] = {
      operationId: entry.id,
      summary: entry.summary,
      security: [{ "x-listacerta-key": [] }],
      parameters: parameters.length > 0 ? parameters : undefined,
      requestBody: entry.bodySchema ? { required: true, content: { "application/json": { schema: jsonSchemaOf(entry.bodySchema) } } } : undefined,
      responses: {
        "200": {
          description: "Sucesso.",
          headers: RATE_LIMIT_HEADERS,
          content: {
            "application/json": {
              schema: jsonSchemaOf(entry.responseSchema),
              example: { note: "Exemplo ilustrativo — não é dado real.", request: entry.example.request, response: entry.example.response },
            },
          },
        },
        ...Object.fromEntries(
          entry.errors.map((code) => [
            String(B2B_API_ERROR_STATUS[code]),
            { description: B2B_API_MESSAGE[code], content: { "application/json": { example: { error: { code, message: B2B_API_MESSAGE[code], request_id: "<uuid>" } } } } },
          ]),
        ),
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "API B2B do ListaCerta",
      version: "v1",
      description:
        "Leitura de listas oficiais de material escolar já publicadas e casamento de SKUs. Prefixo /v1; mudança " +
        "incompatível vira /v2. Autenticação por x-listacerta-key. Exemplos são ilustrativos, nunca dados reais.",
    },
    servers: [{ url: "/v1" }],
    security: [{ "x-listacerta-key": [] }],
    components: {
      securitySchemes: { "x-listacerta-key": { type: "apiKey", in: "header", name: "x-listacerta-key" } },
      schemas: {},
    },
    paths,
  };
}
