import { B2B_API_MESSAGE } from "../messages";
import type { ApiErrorDetail, B2bApiErrorCode } from "../errors";

// Envelope do contrato HTTP `/v1` (S24, Global Constraints). Sucesso: `{ data, next_cursor?, meta }`. Erro:
// `{ error: { code, message, request_id, details? } }`, mensagens fixas em português, `details` só com `path` e o
// código da issue do Zod — NUNCA o valor recebido, stack, SQL ou nome de tabela.

export type ApiEnvironment = "live" | "test";

export type SuccessEnvelope<T> = {
  data: T;
  next_cursor?: string;
  meta: { api_version: "v1"; environment: ApiEnvironment; request_id: string };
};

export type ErrorEnvelope = {
  error: { code: B2bApiErrorCode; message: string; request_id: string; details?: readonly ApiErrorDetail[] };
};

export function apiSuccess<T>(
  data: T,
  opts: { environment: ApiEnvironment; requestId: string; nextCursor?: string | null },
): SuccessEnvelope<T> {
  const envelope: SuccessEnvelope<T> = {
    data,
    meta: { api_version: "v1", environment: opts.environment, request_id: opts.requestId },
  };
  if (opts.nextCursor) envelope.next_cursor = opts.nextCursor;
  return envelope;
}

export function apiError(code: B2bApiErrorCode, requestId: string, details?: readonly ApiErrorDetail[]): ErrorEnvelope {
  const envelope: ErrorEnvelope = { error: { code, message: B2B_API_MESSAGE[code], request_id: requestId } };
  if (details && details.length > 0) envelope.error.details = details;
  return envelope;
}
