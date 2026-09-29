import "server-only";

import type { z } from "zod";

import type { ApiErrorDetail } from "../errors";

/**
 * D-158 (S19): extraído de handler.ts (549 linhas) — sem mudança de comportamento, só posição. Leitura do corpo
 * com corte em stream e os pequenos utilitários de parsing de entrada (params/query/erro do Zod).
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function zodDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({ path: issue.path.map((p) => String(p)).join(".") || "(raiz)", code: issue.code }));
}

/** Query string -> objeto simples (chave repetida vira array, o `.strict()` do esquema recusa o que não esperar). */
export function queryToObject(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

// ---- Leitura do corpo com corte em stream (achado 2, revisão de segurança independente) ------------------------
export class PayloadTooLargeError extends Error {}

/** Lê `request.body` (um `ReadableStream`) pedaço a pedaço, cortando ASSIM QUE passar de `maxBytes` — nunca espera
 * o stream inteiro terminar antes de checar o tamanho. Sem `content-length` (ou com um valor mentiroso, menor que
 * o corpo de verdade), `request.text()` lia tudo antes de qualquer checagem; um corpo malicioso grande sem esse
 * cabeçalho passava batido pela checagem existente e só era rejeitado (`payload_too_large`) depois de consumir
 * tempo/memória lendo o stream inteiro. */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
