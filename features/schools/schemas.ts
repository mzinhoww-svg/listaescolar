import { z } from "zod";

import {
  cleanText,
  mapNetwork,
  normalizeCep,
  normalizeEmail,
  normalizeInep,
  normalizeName,
  normalizePhone,
  type SchoolNetwork,
} from "./normalize";
import type { RowError } from "./ports";

export const INEP_COLUMNS = [
  "CO_ENTIDADE",
  "NO_ENTIDADE",
  "CO_MUNICIPIO",
  "NO_MUNICIPIO",
  "SG_UF",
  "TP_DEPENDENCIA",
  "DS_ENDERECO",
  "NU_ENDERECO",
  "NO_BAIRRO",
  "CO_CEP",
  "NU_DDD",
  "NU_TELEFONE",
  "DS_EMAIL",
] as const;
export type InepColumn = (typeof INEP_COLUMNS)[number];
export const REQUIRED_COLUMNS: readonly InepColumn[] = ["CO_ENTIDADE", "NO_ENTIDADE", "CO_MUNICIPIO", "TP_DEPENDENCIA"];
export type RawInepRow = Partial<Record<InepColumn, string>>;

export type NormalizedSchool = {
  inep: string;
  name: string;
  normalizedName: string;
  network: SchoolNetwork;
  ibgeCode: string;
  neighborhood: string | null;
  address: string | null;
  cep: string | null;
  phone: string | null;
  email: string | null;
};

const cell = z.string().default("");

/** Linha bruta do CSV -> escola normalizada; issues carregam o código do erro em `params.code`. */
export const InepRowSchema = z
  .object({
    CO_ENTIDADE: cell,
    NO_ENTIDADE: cell,
    CO_MUNICIPIO: cell,
    NO_MUNICIPIO: cell,
    SG_UF: cell,
    TP_DEPENDENCIA: cell,
    DS_ENDERECO: cell,
    NU_ENDERECO: cell,
    NO_BAIRRO: cell,
    CO_CEP: cell,
    NU_DDD: cell,
    NU_TELEFONE: cell,
    DS_EMAIL: cell,
  })
  .transform((raw, ctx): NormalizedSchool => {
    const fail = (code: string, message: string) =>
      ctx.issues.push({ code: "custom", message, input: raw, params: { code } });
    const inep = normalizeInep(raw.CO_ENTIDADE);
    if (!/^\d{8}$/.test(inep)) fail("invalid_inep", "INEP inválido (8 dígitos)");
    const name = cleanText(raw.NO_ENTIDADE);
    if (!name) fail("invalid_name", "Nome da escola vazio");
    const network = mapNetwork(raw.TP_DEPENDENCIA);
    if (!network) fail("invalid_network", "Rede (TP_DEPENDENCIA) inválida");
    const ibgeCode = normalizeInep(raw.CO_MUNICIPIO);
    if (!/^\d{7}$/.test(ibgeCode)) fail("invalid_municipality", "Código de município inválido (7 dígitos)");
    if (ctx.issues.length > 0 || !network) return z.NEVER;
    const address = [cleanText(raw.DS_ENDERECO), cleanText(raw.NU_ENDERECO)].filter(Boolean).join(", ");
    return {
      inep,
      name,
      normalizedName: normalizeName(name),
      network,
      ibgeCode,
      neighborhood: cleanText(raw.NO_BAIRRO) || null,
      address: address || null,
      cep: normalizeCep(raw.CO_CEP),
      phone: normalizePhone(raw.NU_DDD, raw.NU_TELEFONE),
      email: normalizeEmail(raw.DS_EMAIL),
    };
  });

export type ParsedRow = { success: true; data: NormalizedSchool } | { success: false; errors: RowError[] };

export function parseInepRow(raw: RawInepRow): ParsedRow {
  const r = InepRowSchema.safeParse(raw);
  if (r.success) return { success: true, data: r.data };
  return {
    success: false,
    errors: r.error.issues.map((i) => {
      const code = (i as { params?: { code?: unknown } }).params?.code;
      return { code: typeof code === "string" ? code : "invalid_row", message: i.message };
    }),
  };
}

// --- Respostas do banco (Zod permissivo em `errors`: lista aberta de {code, message}) ---
const int = z.number().int().nonnegative();
export const rowErrorSchema = z.object({ code: z.string(), message: z.string() });
export const totalsSchema = z.object({ inserted: int, updated: int, duplicate: int, rejected: int });
const statusSchema = z.enum(["pending", "processing", "completed", "failed"]);
export const claimResponseSchema = z
  .array(z.object({ batch_id: z.string().uuid(), already_exists: z.boolean(), status: statusSchema }))
  .length(1);
export const batchRowSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema,
  is_demo: z.boolean(),
  total_rows: int,
  inserted_count: int,
  updated_count: int,
  duplicate_count: int,
  rejected_count: int,
});
export const errorRowSchema = z.object({
  row_number: z.number().int().positive(),
  action: z.enum(["duplicate", "rejected"]),
  errors: z.array(rowErrorSchema),
  raw: z.record(z.string(), z.unknown()).nullable(),
});
