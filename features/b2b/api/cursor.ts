import { z } from "zod";

// Cursor opaco (keyset) do contrato HTTP: base64url de um JSON validado por Zod. `v` é a versão do formato do
// cursor (não a da API); cursor de outra versão é tratado como adulterado.

const CURSOR_VERSION = 1;

export function encodeCursor(payload: Record<string, unknown>): string {
  const body = JSON.stringify({ v: CURSOR_VERSION, ...payload });
  return Buffer.from(body, "utf8").toString("base64url");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `null` para base64 inválido, JSON inválido, versão errada ou forma que não bate com `schema` (cursor adulterado). */
export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T | null {
  let json: unknown;
  try {
    const body = Buffer.from(cursor, "base64url").toString("utf8");
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isPlainObject(json) || json.v !== CURSOR_VERSION) return null;
  const { v: _v, ...rest } = json;
  void _v;
  const parsed = schema.safeParse(rest);
  return parsed.success ? parsed.data : null;
}
