import { z } from "zod";

import { B2B_API_ERROR_STATUS, type B2bApiErrorCode } from "../errors";
import { B2B_API_MESSAGE } from "../messages";
import type { Endpoint } from "./contract";

// `GET /v1/openapi.json` (público, sem chave, sem dado): documento gerado do próprio contrato — endpoints,
// parâmetros, esquemas, escopos, erros, cabeçalhos de limite e um exemplo ilustrativo (marcado como exemplo,
// validado contra o próprio esquema em teste). Nunca à mão: a mesma fonte que valida a resposta documenta a resposta.
//
// `entry.path` já vem com o prefixo `/v1/...` (Global Constraints: caminho no estilo OpenAPI, independente da
// estrutura de pastas do App Router); por isso o `server` é a raiz (`/`), nunca `/v1` — dobrar o prefixo faria um
// cliente gerado chamar `/v1/v1/schools` (cairia no catch-all 404).

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

const RETRY_AFTER_HEADER = {
  "Retry-After": { description: "Segundos até o fim da janela (só no 429).", schema: { type: "integer" } },
} as const;

const ILLUSTRATIVE_SUMMARY = "Exemplo ilustrativo — não é dado real.";
/** Placeholder de `request_id` nos exemplos (nunca um id de requisição real). */
const EXAMPLE_REQUEST_ID = "11111111-1111-4111-8111-111111111111";

/** Envelope de sucesso real do contrato (`{ data, next_cursor?, meta }`) — o schema documentado é ESTE, nunca só
 * `entry.responseSchema` (que é apenas o `data`). */
export function successEnvelopeSchema(responseSchema: z.ZodTypeAny) {
  return z
    .object({
      data: responseSchema,
      next_cursor: z.string().optional(),
      meta: z
        .object({ api_version: z.literal("v1"), environment: z.enum(["live", "test"]), request_id: z.string() })
        .strict(),
    })
    .strict();
}

/** Envelope de erro real do contrato (`{ error: { code, message, request_id, details? } }`). */
export const ERROR_ENVELOPE_SCHEMA = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        request_id: z.string(),
        details: z.array(z.object({ path: z.string(), code: z.string() }).strict()).optional(),
      })
      .strict(),
  })
  .strict();

export function successExampleEnvelope(response: unknown): unknown {
  return { data: response, meta: { api_version: "v1", environment: "live", request_id: EXAMPLE_REQUEST_ID } };
}

export function errorExampleEnvelope(code: B2bApiErrorCode): unknown {
  return { error: { code, message: B2B_API_MESSAGE[code], request_id: EXAMPLE_REQUEST_ID } };
}

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
      requestBody: entry.bodySchema
        ? {
            required: true,
            content: {
              "application/json": {
                schema: jsonSchemaOf(entry.bodySchema),
                examples: entry.example.request !== undefined ? { illustrative: { summary: ILLUSTRATIVE_SUMMARY, value: entry.example.request } } : undefined,
              },
            },
          }
        : undefined,
      responses: {
        "200": {
          description: "Sucesso.",
          headers: RATE_LIMIT_HEADERS,
          content: {
            "application/json": {
              schema: jsonSchemaOf(successEnvelopeSchema(entry.responseSchema)),
              examples: { illustrative: { summary: ILLUSTRATIVE_SUMMARY, value: successExampleEnvelope(entry.example.response) } },
            },
          },
        },
        ...Object.fromEntries(
          entry.errors.map((code) => [
            String(B2B_API_ERROR_STATUS[code]),
            {
              description: B2B_API_MESSAGE[code],
              headers: code === "rate_limited" ? RETRY_AFTER_HEADER : undefined,
              content: {
                "application/json": {
                  schema: jsonSchemaOf(ERROR_ENVELOPE_SCHEMA),
                  examples: { illustrative: { summary: ILLUSTRATIVE_SUMMARY, value: errorExampleEnvelope(code) } },
                },
              },
            },
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
    // `entry.path` já inclui `/v1`; o server é a raiz para não dobrar o prefixo (ver comentário no topo do arquivo).
    servers: [{ url: "/" }],
    security: [{ "x-listacerta-key": [] }],
    components: {
      securitySchemes: { "x-listacerta-key": { type: "apiKey", in: "header", name: "x-listacerta-key" } },
      schemas: {},
    },
    paths,
  };
}
