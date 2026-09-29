import { z } from "zod";

import { COMMON, EVENTS, type EventName } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INEP = /^\d{8}$/;
const IBGE = /^\d{7}$/;
const PII = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // e-mail
  /(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[-\s]?\d{4}/, // telefone BR (10 ou 11 dígitos, com ou sem máscara)
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/, // CPF
  /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/, // CNPJ
];

const safeIdentifier = (v: string) => UUID.test(v) || INEP.test(v) || IBGE.test(v);

/** Verdadeiro se algum texto (ou item de lista) parece dado pessoal. Identificadores pseudônimos não contam. */
export function looksLikePersonalData(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(looksLikePersonalData);
  return typeof v === "string" && !safeIdentifier(v) && PII.some((r) => r.test(v));
}

export type Built = { ok: true; properties: Record<string, unknown> } | { ok: false; reason: "schema" | "pii" };

const pick = (source: Record<string, unknown>, shape: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(source).filter(([k, v]) => Object.hasOwn(shape, k) && v !== undefined));

/** Descarta chave fora do esquema; se o restante não valida ou parece dado pessoal, descarta o evento inteiro. */
export function buildEvent(name: EventName, props: Record<string, unknown>, common: Record<string, unknown>): Built {
  const schema = EVENTS[name];
  const parsed = z
    .object({ ...COMMON.shape, ...schema.shape })
    .strict()
    .safeParse({ ...pick(common, COMMON.shape), ...pick(props, schema.shape) });
  if (!parsed.success) {
    // Valor que parece dado pessoal é "pii" mesmo quando também falha no formato.
    const raw = [...Object.values(pick(common, COMMON.shape)), ...Object.values(pick(props, schema.shape))];
    return { ok: false, reason: raw.some(looksLikePersonalData) ? "pii" : "schema" };
  }
  if (Object.values(parsed.data).some(looksLikePersonalData)) return { ok: false, reason: "pii" };
  return { ok: true, properties: parsed.data };
}
