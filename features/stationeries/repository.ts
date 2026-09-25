import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "./actor";
import { CatalogItemInputSchema, catalogItemKey, type CatalogItemInput, type CatalogStock } from "./catalog";
import { isValidCnpj } from "./cnpj";
import { neighborhoodLabel, normalizeNeighborhood } from "./neighborhood";
import type { LocalCatalogCandidate, LocalCatalogSource, LocalLocation } from "./ports";
import { LGPD_TEXT_VERSION, PAYMENT_METHODS, type StationeryBasics, type StationeryConsent, type StationeryService } from "./schemas";
import {
  OWNER_EDITABLE_STATUSES,
  STATIONERY_STATUSES,
  type StationeryStatus,
} from "./state";

// Funções recebem o cliente de SERVIÇO (server-only) e um `SessionActor` (sessão validada no servidor; ver actor.ts).
// Como o service_role ignora a RLS, posse e estado são conferidos aqui e, nas escritas críticas, DENTRO da função SQL
// (mesma transação e trava da escrita).

export type StationeryErrorCode =
  | "cnpj_taken"
  | "already_owner"
  | "not_found"
  | "forbidden"
  | "invalid_state"
  | "transition_not_allowed"
  | "precondition_failed"
  | "actor_invalid"
  | "reason_required"
  | "consent_required"
  | "limit_exceeded"
  | "invalid_input"
  | "database";

export class StationeryRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: StationeryErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "StationeryRepositoryError";
  }
}

/** `hint` das funções SQL (estável, uma causa por valor) -> código do repositório. */
const HINT_CODES: Readonly<Record<string, StationeryErrorCode>> = {
  cnpj_taken: "cnpj_taken",
  already_owner: "already_owner",
  not_found: "not_found",
  forbidden: "forbidden",
  invalid_state: "invalid_state",
  transition_not_allowed: "transition_not_allowed",
  precondition_failed: "precondition_failed",
  actor_invalid: "actor_invalid",
  reason_required: "reason_required",
  consent_required: "consent_required",
  limit_exceeded: "limit_exceeded",
  invalid_input: "invalid_input",
};

/** Causa do erro do banco: pelo `hint` da função; sem hint, pelo SQLSTATE. */
function dbErrorCode(error: { code?: string; hint?: string | null }): StationeryErrorCode {
  if (error.hint && Object.hasOwn(HINT_CODES, error.hint)) return HINT_CODES[error.hint] ?? "database";
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514": // check de coluna violado (valor fora do permitido)
      return "invalid_input";
    case "54000":
      return "limit_exceeded";
    default:
      return "database";
  }
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: StationeryErrorCode): never {
  throw new StationeryRepositoryError(`${what}: ${error.message}`, code ?? dbErrorCode(error), error.code);
}

/** O ator precisa ter sido criado por `getSessionActor` (o tipo de marca não cobre `as`). */
function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new StationeryRepositoryError("ator não vem da sessão", "forbidden");
}

const statusSchema = z.enum(STATIONERY_STATUSES);

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base === "" ? "papelaria" : base;
}

/** Bairros no formato da função SQL: chave normalizada (uma só regra) + texto de exibição. */
function areaPayload(neighborhoods: readonly string[]): { key: string; label: string }[] {
  const byKey = new Map<string, string>();
  for (const name of neighborhoods) {
    const key = normalizeNeighborhood(name);
    if (key !== "" && !byKey.has(key)) byKey.set(key, neighborhoodLabel(name));
  }
  return [...byKey].map(([key, label]) => ({ key, label }));
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export type RegisterInput = {
  basics: StationeryBasics;
  service: StationeryService;
  /** Aceite LGPD obrigatório. A data e a versão do texto são do servidor (o banco carimba a data). */
  consent: StationeryConsent;
};

const registeredSchema = z.object({ id: z.uuid(), slug: z.string(), created: z.boolean() });

/**
 * Cadastro atômico (`stationery_register`): papelaria em `signup` + dono + áreas + aceite LGPD, tudo ou nada.
 * O dono é o ator da sessão (só `parent`). Duplo envio (mesmo dono e CNPJ) devolve a papelaria existente
 * (`created: false`); outro CNPJ para quem já é dono é `already_owner`; CNPJ de outro dono é `cnpj_taken`.
 */
export async function registerStationery(
  client: SupabaseClient,
  actor: SessionActor,
  input: RegisterInput,
): Promise<{ id: string; slug: string; created: boolean }> {
  requireActor(actor);
  if (actor.role !== "parent") throw new StationeryRepositoryError("só responsável cadastra papelaria", "forbidden");
  const { basics, service, consent } = input;
  if (consent.lgpdAccepted !== true) throw new StationeryRepositoryError("aceite LGPD obrigatório", "consent_required");
  const { data, error } = await client.rpc("stationery_register", {
    p_owner_id: actor.userId,
    p_slug: slugify(basics.tradeName),
    p_trade_name: basics.tradeName,
    p_legal_name: basics.legalName,
    p_cnpj: basics.cnpj,
    p_municipality_id: basics.municipalityId,
    p_neighborhood: basics.neighborhood,
    p_address: basics.address ?? null,
    p_cep: basics.cep ?? null,
    p_whatsapp: service.whatsapp,
    p_phone: service.phone ?? null,
    p_email: service.email ?? null,
    p_offers_pickup: service.offersPickup,
    p_offers_delivery: service.offersDelivery,
    p_service_radius_km: service.serviceRadiusKm,
    p_opening_hours: service.openingHours ?? null,
    p_payment_methods: service.paymentMethods,
    p_areas: areaPayload(service.areas),
    p_lgpd_text_version: LGPD_TEXT_VERSION,
  });
  if (error) fail("cadastrar papelaria", error);
  return registeredSchema.parse(data);
}

/** Grava o aceite LGPD depois do cadastro (só o dono, antes da análise). Data e versão do texto são do servidor. */
export async function recordConsent(client: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<void> {
  requireActor(actor);
  const { error } = await client.rpc("stationery_record_consent", {
    p_id: stationeryId,
    p_actor_id: actor.userId,
    p_text_version: LGPD_TEXT_VERSION,
  });
  if (error) fail("registrar aceite", error);
}

// ---------------------------------------------------------------------------
// Posse e estado
// ---------------------------------------------------------------------------

async function loadOwned(
  client: SupabaseClient,
  stationeryId: string,
  actorId: string,
  allowed: readonly StationeryStatus[],
): Promise<{ status: StationeryStatus; municipalityId: string }> {
  const { data, error } = await client
    .from("stationeries")
    .select("status, municipality_id, stationery_members!inner(profile_id)")
    .eq("id", stationeryId)
    .eq("stationery_members.profile_id", actorId)
    .maybeSingle();
  if (error) fail("ler papelaria", error);
  if (!data) throw new StationeryRepositoryError("papelaria não encontrada para este usuário", "forbidden");
  const row = z.object({ status: statusSchema, municipality_id: z.uuid() }).parse(data);
  if (!allowed.includes(row.status)) {
    throw new StationeryRepositoryError(`operação não permitida em ${row.status}`, "invalid_state");
  }
  return { status: row.status, municipalityId: row.municipality_id };
}

/** Valores do cadastro que o dono pode editar; os mesmos formatos que o banco exige (nunca status, slug, `is_demo`). */
const ProfilePatchSchema = z.strictObject({
  tradeName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().min(2).max(200).optional(),
  cnpj: z.string().refine((v) => /^[0-9A-Z]{14}$/.test(v) && isValidCnpj(v), "CNPJ inválido.").optional(),
  neighborhood: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(200).optional(),
  cep: z.string().regex(/^[0-9]{8}$/).optional(),
  whatsapp: z.string().regex(/^\+55[0-9]{10,11}$/).optional(),
  phone: z.string().regex(/^\+55[0-9]{10,11}$/).optional(),
  email: z.email().max(254).optional(),
  offersPickup: z.boolean().optional(),
  offersDelivery: z.boolean().optional(),
  serviceRadiusKm: z.number().int().min(0).max(50).optional(),
  openingHours: z.string().trim().max(300).optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length).optional(),
});
export type ProfilePatch = z.input<typeof ProfilePatchSchema>;

const PATCH_COLUMNS: Readonly<Record<string, string>> = {
  tradeName: "trade_name",
  legalName: "legal_name",
  cnpj: "cnpj",
  neighborhood: "neighborhood",
  address: "address",
  cep: "cep",
  whatsapp: "whatsapp",
  phone: "phone",
  email: "email",
  offersPickup: "offers_pickup",
  offersDelivery: "offers_delivery",
  serviceRadiusKm: "service_radius_km",
  openingHours: "opening_hours",
  paymentMethods: "payment_methods",
};

/**
 * Dono edita o cadastro. Valores são revalidados (mesmos formatos do banco). A escrita leva o filtro de estado
 * (o estado pode ter mudado depois da leitura) e confere as linhas afetadas. O banco recusa `cnpj` depois do envio.
 */
export async function updateProfile(
  client: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  patch: ProfilePatch,
): Promise<void> {
  requireActor(actor);
  const parsed = ProfilePatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new StationeryRepositoryError(`cadastro inválido: ${parsed.error.issues[0]?.message ?? ""}`, "invalid_input");
  }
  await loadOwned(client, stationeryId, actor.userId, OWNER_EDITABLE_STATUSES);
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (Object.hasOwn(PATCH_COLUMNS, key) && value !== undefined) columns[PATCH_COLUMNS[key] as string] = value;
  }
  if (Object.keys(columns).length === 0) return;
  const { data, error } = await client
    .from("stationeries")
    .update(columns)
    .eq("id", stationeryId)
    .in("status", [...OWNER_EDITABLE_STATUSES])
    .select("id");
  if (error) fail("atualizar cadastro", error);
  if (!data || data.length !== 1) {
    throw new StationeryRepositoryError("o status da papelaria mudou; nada foi alterado", "invalid_state");
  }
}

/** Substitui os bairros atendidos (do município da papelaria). Posse e estado conferidos na função SQL, sob trava. */
export async function setAreas(
  client: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  neighborhoods: readonly string[],
): Promise<void> {
  requireActor(actor);
    const { error } = await client.rpc("stationery_replace_areas", {
    p_id: stationeryId,
    p_actor_id: actor.userId,
    p_areas: areaPayload(neighborhoods),
  });
  if (error) fail("gravar áreas", error);
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** Itens por envio (o CSV já limita a 2.000 linhas). Acima disso: erro claro, nunca corte silencioso. */
export const CATALOG_UPSERT_MAX_ITEMS = 2000;

/**
 * Insere ou atualiza itens por (papelaria, item_key) numa só transação (`stationery_upsert_catalog`, que confere
 * posse e estado sob trava). Idempotente: repetir o envio não duplica linhas e `price_updated_at` só renova nos itens
 * cujo preço mudou (o banco decide, por trigger). Nome repetido no lote: vale o último.
 */
export async function upsertCatalogItems(
  client: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  items: readonly CatalogItemInput[],
): Promise<{ upserted: number }> {
  requireActor(actor);
  const byKey = new Map<string, { name: string; item_key: string; price_cents: number; stock_status: CatalogStock }>();
  for (const raw of items) {
    const parsed = CatalogItemInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StationeryRepositoryError(`item inválido: ${parsed.error.issues[0]?.message ?? ""}`, "invalid_input");
    }
    const key = catalogItemKey(parsed.data.name);
    byKey.set(key, { name: parsed.data.name, item_key: key, price_cents: parsed.data.priceCents, stock_status: parsed.data.stock });
  }
  if (byKey.size > CATALOG_UPSERT_MAX_ITEMS) {
    throw new StationeryRepositoryError(`no máximo ${CATALOG_UPSERT_MAX_ITEMS} itens por envio`, "limit_exceeded");
  }
  const { data, error } = await client.rpc("stationery_upsert_catalog", {
    p_id: stationeryId,
    p_actor_id: actor.userId,
    p_items: [...byKey.values()],
  });
  if (error) fail("gravar catálogo", error);
  return { upserted: z.number().int().parse(data) };
}

export type CatalogRow = {
  id: string;
  name: string;
  itemKey: string;
  priceCents: number;
  priceSource: string;
  stock: CatalogStock;
  isActive: boolean;
  /** Data do preço informado (`catalog_items.price_updated_at`): muda só quando o preço muda. */
  priceUpdatedAt: Date;
};

const catalogRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  item_key: z.string(),
  price_cents: z.number().int(),
  price_source: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  is_active: z.boolean(),
  price_updated_at: z.string(),
});
const mapCatalog = (r: z.output<typeof catalogRowSchema>): CatalogRow => ({
  id: r.id,
  name: r.name,
  itemKey: r.item_key,
  priceCents: r.price_cents,
  priceSource: r.price_source,
  stock: r.stock_status,
  isActive: r.is_active,
  priceUpdatedAt: new Date(r.price_updated_at),
});
const CATALOG_COLUMNS = "id, name, item_key, price_cents, price_source, stock_status, is_active, price_updated_at";

const CATALOG_PAGE_SIZE = 1000; // igual ao teto de linhas do PostgREST (max_rows)
/** Itens lidos por papelaria. Acima disso: erro claro (`limit_exceeded`), nunca lista cortada em silêncio. */
export const CATALOG_MAX_ITEMS = 5000;

/** Todas as páginas do catálogo (ordem estável); passou do teto, falha. */
async function fetchCatalog(client: SupabaseClient, stationeryId: string, activeOnly: boolean): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  for (let from = 0; ; from += CATALOG_PAGE_SIZE) {
    let q = client.from("catalog_items").select(CATALOG_COLUMNS).eq("stationery_id", stationeryId);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order("name").order("id").range(from, from + CATALOG_PAGE_SIZE - 1);
    if (error) fail("listar catálogo", error);
    const page = data ?? [];
    for (const r of page) rows.push(mapCatalog(catalogRowSchema.parse(r)));
    if (rows.length > CATALOG_MAX_ITEMS) {
      throw new StationeryRepositoryError(`catálogo com mais de ${CATALOG_MAX_ITEMS} itens`, "limit_exceeded");
    }
    if (page.length < CATALOG_PAGE_SIZE) return rows;
  }
}

/** Catálogo da papelaria (todos os itens, para o dono). */
export async function listCatalogItems(client: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<CatalogRow[]> {
  requireActor(actor);
  await loadOwned(client, stationeryId, actor.userId, STATIONERY_STATUSES);
  return fetchCatalog(client, stationeryId, false);
}

// ---------------------------------------------------------------------------
// Transição de status
// ---------------------------------------------------------------------------

/** Papel de transição do ator da sessão: admin/system agem como a equipe; parent/stationery_member como dono. */
function transitionRole(actor: SessionActor, as: "owner" | undefined): "owner" | "admin" | "system" {
  if (as === "owner") {
    if (actor.role === "school_member" || actor.role === "system") throw new StationeryRepositoryError("papel sem acesso à papelaria", "forbidden");
    return "owner";
  }
  switch (actor.role) {
    case "admin":
      return "admin";
    case "system":
      return "system";
    case "parent":
    case "stationery_member":
      return "owner";
    default:
      throw new StationeryRepositoryError("papel sem acesso à papelaria", "forbidden");
  }
}

/**
 * Única porta de escrita de status: a função SQL aplica a matriz, o motivo e as pré-condições. Ator = sessão;
 * `as: "owner"` faz o admin agir como dono da própria papelaria (o banco confere o vínculo).
 */
export async function transition(
  client: SupabaseClient,
  actor: SessionActor,
  input: { id: string; to: StationeryStatus; reason?: string; as?: "owner" },
): Promise<StationeryStatus> {
  requireActor(actor);
  const { data, error } = await client.rpc("stationery_transition", {
    p_id: input.id,
    p_to: input.to,
    p_actor_id: actor.userId,
    p_actor_role: transitionRole(actor, input.as),
    p_reason: input.reason ?? null,
  });
  if (error) fail("transição de status", error);
  return statusSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type PublicProfile = {
  id: string;
  slug: string;
  tradeName: string;
  municipalityId: string;
  neighborhood: string | null;
  offersPickup: boolean;
  offersDelivery: boolean;
  serviceRadiusKm: number;
  openingHours: string | null;
  paymentMethods: string[];
  whatsapp: string | null;
  isDemo: boolean;
  updatedAt: Date;
  areas: string[];
  catalog: CatalogRow[];
};

const publicRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  trade_name: z.string(),
  municipality_id: z.uuid(),
  neighborhood: z.string().nullable(),
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  service_radius_km: z.number().int(),
  opening_hours: z.string().nullable(),
  payment_methods: z.array(z.string()),
  whatsapp: z.string().nullable(),
  is_demo: z.boolean(),
  updated_at: z.string(),
});

/** Perfil público (só papelaria `active`), pela view `stationery_public`; nunca dados de cadastro. */
export async function getPublicProfile(client: SupabaseClient, slug: string): Promise<PublicProfile | null> {
  const { data, error } = await client
    .from("stationery_public")
    .select("id, slug, trade_name, municipality_id, neighborhood, offers_pickup, offers_delivery, service_radius_km, opening_hours, payment_methods, whatsapp, is_demo, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("ler perfil público", error);
  if (!data) return null;
  const p = publicRowSchema.parse(data);
  const [areas, catalog] = await Promise.all([
    client.from("stationery_areas").select("neighborhood, display_name").eq("stationery_id", p.id).order("neighborhood"),
    fetchCatalog(client, p.id, true),
  ]);
  if (areas.error) fail("ler áreas", areas.error);
  return {
    id: p.id,
    slug: p.slug,
    tradeName: p.trade_name,
    municipalityId: p.municipality_id,
    neighborhood: p.neighborhood,
    offersPickup: p.offers_pickup,
    offersDelivery: p.offers_delivery,
    serviceRadiusKm: p.service_radius_km,
    openingHours: p.opening_hours,
    paymentMethods: p.payment_methods,
    whatsapp: p.whatsapp,
    isDemo: p.is_demo,
    updatedAt: new Date(p.updated_at),
    areas: (areas.data ?? []).map((a) => String(a.display_name ?? a.neighborhood)),
    catalog,
  };
}

export type AdminRow = {
  id: string;
  slug: string;
  tradeName: string;
  legalName: string | null;
  cnpj: string;
  status: StationeryStatus;
  statusReason: string | null;
  municipalityId: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const adminRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  trade_name: z.string(),
  legal_name: z.string().nullable(),
  cnpj: z.string(),
  status: statusSchema,
  status_reason: z.string().nullable(),
  municipality_id: z.uuid(),
  is_demo: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
const ADMIN_COLUMNS = "id, slug, trade_name, legal_name, cnpj, status, status_reason, municipality_id, is_demo, created_at, updated_at";
const mapAdmin = (r: z.output<typeof adminRowSchema>): AdminRow => ({
  id: r.id,
  slug: r.slug,
  tradeName: r.trade_name,
  legalName: r.legal_name,
  cnpj: r.cnpj,
  status: r.status,
  statusReason: r.status_reason,
  municipalityId: r.municipality_id,
  isDemo: r.is_demo,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

/** Lista para a área admin (cliente de serviço; a Server Action confere o papel admin antes). */
export async function listForAdmin(
  client: SupabaseClient,
  options: { status?: StationeryStatus; limit?: number } = {},
): Promise<AdminRow[]> {
  let q = client.from("stationeries").select(ADMIN_COLUMNS).order("created_at", { ascending: false }).limit(options.limit ?? 200);
  if (options.status) q = q.eq("status", options.status);
  const { data, error } = await q;
  if (error) fail("listar papelarias", error);
  return (data ?? []).map((r) => mapAdmin(adminRowSchema.parse(r)));
}

/** Papelaria do dono (qualquer status), ou `null`. */
export async function getOwnStationery(client: SupabaseClient, ownerId: string): Promise<AdminRow | null> {
  const { data, error } = await client
    .from("stationeries")
    .select(`${ADMIN_COLUMNS}, stationery_members!inner(profile_id, member_role)`)
    .eq("stationery_members.profile_id", ownerId)
    .eq("stationery_members.member_role", "owner")
    .maybeSingle();
  if (error) fail("ler papelaria do dono", error);
  return data ? mapAdmin(adminRowSchema.parse(data)) : null;
}

// ---------------------------------------------------------------------------
// Fonte da cotação local
// ---------------------------------------------------------------------------

const candidateSchema = z.object({
  stationery_id: z.uuid(),
  item_key: z.string(),
  price_cents: z.number().int(),
  price_source: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  is_active: z.boolean(),
  price_updated_at: z.string(),
  status: z.string(),
  municipality_id: z.uuid(),
  stationery_neighborhood: z.string().nullable(),
  is_demo: z.boolean(),
  areas: z.array(z.object({ municipality_id: z.uuid(), neighborhood: z.string() })),
});

/** Teto de candidatos por consulta. Passou disso, `findCandidates` FALHA (`limit_exceeded`): nunca devolve lista parcial. */
export const CANDIDATE_LIMIT = 5000;

/**
 * Implementa `LocalCatalogSource` sobre a função SQL `stationery_local_candidates` (só service_role): o filtro
 * (papelaria `active`, município ou área, item ativo, estoque não zerado, chaves pedidas) roda no banco; a função
 * devolve um único jsonb (sem o corte de 1000 linhas do PostgREST) e falha se houver mais que o limite.
 * O refinamento por bairro fica em `servesLocation` (uma só normalização).
 */
export function createLocalCatalogSource(client: SupabaseClient, options: { limit?: number } = {}): LocalCatalogSource {
  const limit = options.limit ?? CANDIDATE_LIMIT;
  return {
    async findCandidates(query: { itemKeys: readonly string[]; location: LocalLocation }, opts) {
      if (query.itemKeys.length === 0) return [];
      const call = client.rpc("stationery_local_candidates", {
        p_municipality_id: query.location.municipalityId,
        p_item_keys: [...query.itemKeys],
        p_limit: limit,
      });
      const { data, error } = await (opts?.signal ? call.abortSignal(opts.signal) : call);
      if (error) fail("buscar catálogo local", error);
      return z.array(candidateSchema).parse(data ?? []).map(
        (r): LocalCatalogCandidate => ({
          stationeryId: r.stationery_id,
          status: r.status,
          municipalityId: r.municipality_id,
          neighborhood: r.stationery_neighborhood,
          isDemo: r.is_demo,
          areas: r.areas.map((a) => ({ municipalityId: a.municipality_id, neighborhood: a.neighborhood })),
          itemKey: r.item_key,
          priceCents: r.price_cents,
          priceSource: r.price_source,
          stock: r.stock_status,
          itemActive: r.is_active,
          priceUpdatedAt: new Date(r.price_updated_at),
        }),
      );
    },
  };
}
