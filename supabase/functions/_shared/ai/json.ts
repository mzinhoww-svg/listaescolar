import { AiError } from "./errors.ts";

const MAX_TEXT = 2_000_000;

/** Parsing tolerante: JSON puro, bloco ```json ou o maior trecho { ... }. O resultado ainda passa pelo Zod. */
export function parseJsonLoose(text: string): unknown {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT) {
    throw new AiError("invalid_output", { detail: "size" });
  }
  const t = text.trim();
  const candidates: string[] = [t];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a !== -1 && b > a) candidates.push(t.slice(a, b + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // tenta o próximo
    }
  }
  throw new AiError("invalid_output", { detail: "not_json" });
}
