// Compartilhado: `lib/analytics` (re-exporta) e a Edge Function. `zod` vem do node_modules (Node) ou do deno.json (Deno).
import { z } from "zod";

/**
 * Esquema dos eventos de produto (ADR-007, `docs/tracking-plan.md`). Regras:
 * - todo evento é `.strict()`; nenhum campo de texto livre; só identificadores pseudônimos (uuid, INEP, IBGE, slug),
 *   enums e números;
 * - nunca nome, e-mail, telefone, CPF/CNPJ, apelido ou série de estudante, conteúdo de lista, IP ou dinheiro.
 */

const UUID = z.uuid();
const INEP = z.string().regex(/^\d{8}$/);
const IBGE = z.string().regex(/^\d{7}$/);
const SLUG = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
/** Rota já normalizada (segmentos dinâmicos viram `[id]`): só letras minúsculas, dígitos, hífen e colchetes. */
const PATH = z.string().max(120).regex(/^\/[a-z0-9\-/[\]]*$/);
/** Valor de `utm_*`: texto curto e restrito (sem `@`, sem espaço). */
const UTM = z.string().max(60).regex(/^[A-Za-z0-9_.+-]+$/);
const DOMAIN = z.string().max(100).regex(/^[a-z0-9.-]+$/);
const COUNT = z.number().int().min(0).max(1_000_000);
const YEAR = z.number().int().min(2000).max(2100);
const VERSION = z.string().max(30).regex(/^[A-Za-z0-9_.-]+$/);

export const APP_ENVS = ["production", "preview", "staging", "local"] as const;
export const ROLES = ["anonymous", "parent", "school_member", "stationery_member", "admin"] as const;

/** Propriedades comuns a todo evento. */
export const COMMON = z.object({
  is_internal: z.boolean(),
  app_env: z.enum(APP_ENVS),
  is_demo: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
  municipality_ibge: IBGE.optional(),
  device_class: z.enum(["mobile", "tablet", "desktop"]).optional(),
});

const LOGIN_METHOD = z.enum(["magic_link", "google"]);

export const EVENTS = {
  // Funil 1 · Família
  landing_viewed: z.object({
    path: PATH,
    utm_source: UTM.optional(),
    utm_medium: UTM.optional(),
    utm_campaign: UTM.optional(),
    referrer_domain: DOMAIN.optional(),
  }),
  school_searched: z.object({ query_length: COUNT, results_count: COUNT, has_filters: z.boolean() }),
  school_viewed: z.object({
    school_inep: INEP,
    verification_status: z.enum(["registered", "claimed", "verified", "suspended"]),
  }),
  list_viewed: z.object({
    school_inep: INEP,
    grade_slug: SLUG,
    school_year: YEAR,
    list_version_id: UUID,
    items_count: COUNT,
    /** A lista pública não expõe alertas: só entra quando a origem sabe. */
    has_alerts: z.boolean().optional(),
  }),
  purchase_clicked: z.object({
    canal: z.enum(["marketplace", "papelaria_whatsapp", "papelaria_cotacao", "carrinho"]),
    list_version_id: UUID.optional(),
    school_inep: INEP.optional(),
    grade_slug: SLUG.optional(),
    retailer_slug: SLUG.optional(),
  }),
  // Funil 2 · Envio de lista
  list_upload_started: z.object({
    /** O papel define a origem no servidor; o navegador só informa quando sabe. */
    source: z.enum(["school", "parent"]).optional(),
    mime_type: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "other"]),
    size_bucket: z.enum(["<1MB", "1-5MB", ">5MB"]),
    has_school: z.boolean(),
  }),
  ocr_completed: z.object({
    duracao_ms: COUNT,
    fila: z.enum(["inline", "async"]),
    status: z.enum(["accepted", "low_confidence", "failed"]),
    items_count: COUNT,
    model_route: z.enum(["cheap", "strong", "vision"]).optional(),
    attempts: COUNT.optional(),
  }),
  list_auto_approved: z.object({
    overall_score_bucket: z.enum(["lt_50", "50_69", "70_89", "gte_90"]),
    rules_version: VERSION,
  }),
  list_published: z.object({
    school_inep: INEP.optional(),
    grade_slug: SLUG,
    school_year: YEAR,
    origin: z.enum(["auto", "human"]),
    is_first_version: z.boolean(),
  }),
  // Funil 3 · Papelaria
  stationery_registered: z.object({ municipality_ibge: IBGE, offers_pickup: z.boolean(), offers_delivery: z.boolean() }),
  catalog_activated: z.object({ catalog_items_count: COUNT, days_since_registered: COUNT }),
  lead_received: z.object({
    billing_source: z.enum(["free_lead", "pass_lead", "lead_debit"]).optional(),
    items_count_bucket: z.enum(["1-5", "6-15", "16+"]),
    school_inep: INEP.optional(),
  }),
  lead_converted: z.object({
    signals: z.array(z.enum(["stationery", "parent", "pix_platform"])).max(3),
    hours_to_convert: COUNT.optional(),
  }),
  // Acrescentados na S28
  login_started: z.object({ method: LOGIN_METHOD }),
  login_completed: z.object({ method: LOGIN_METHOD }),
  list_shared: z.object({
    channel: z.enum(["whatsapp", "copy_link", "native_share"]),
    school_inep: INEP.optional(),
    grade_slug: SLUG.optional(),
  }),
  cart_options_viewed: z.object({ list_version_id: UUID.optional(), options_count: COUNT }),
  stationery_onboarding_step: z.object({
    step: z.enum(["register", "catalog", "areas", "first_lead"]),
    status: z.enum(["viewed", "completed"]),
  }),
} satisfies Record<string, z.ZodObject<z.ZodRawShape>>;

export type EventName = keyof typeof EVENTS;
export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];
export const isEventName = (v: string): v is EventName => Object.hasOwn(EVENTS, v);

/** Faixas em vez de valor exato, para não permitir identificar uma lista pelo número de itens. */
export function itemsCountBucket(n: number): "1-5" | "6-15" | "16+" {
  return n <= 5 ? "1-5" : n <= 15 ? "6-15" : "16+";
}
export function scoreBucket(score: number): "lt_50" | "50_69" | "70_89" | "gte_90" {
  const pct = score <= 1 ? score * 100 : score;
  return pct < 50 ? "lt_50" : pct < 70 ? "50_69" : pct < 90 ? "70_89" : "gte_90";
}
export function sizeBucket(bytes: number): "<1MB" | "1-5MB" | ">5MB" {
  return bytes < 1_048_576 ? "<1MB" : bytes <= 5_242_880 ? "1-5MB" : ">5MB";
}
