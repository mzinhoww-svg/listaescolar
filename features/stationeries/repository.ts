import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CATALOG_PRICE_SOURCE, CatalogItemInputSchema, catalogItemKey, type CatalogItemInput, type CatalogStock } from "./catalog";
import type { LocalCatalogCandidate, LocalCatalogSource, LocalLocation } from "./ports";
import type { StationeryBasics, StationeryConsent, StationeryService } from "./schemas";
import {
  AREAS_WRITABLE_STATUSES,
  CATALOG_WRITABLE_STATUSES,
  OWNER_EDITABLE_STATUSES,
  STATIONERY_STATUSES,
  type StationeryStatus,
  type TransitionActor,
} from "./state";

// Funções recebem o cliente de SERVIÇO (server-only), depois que a Server Action validou sessão e papel.
// Como o service_role ignora a RLS, o repositório reaplica as regras de posse e de estado do dono.

export type StationeryErrorCode =
  | "cnpj_taken"
  | "already_owner"
  | "not_found"
  | "forbidden"
  | "invalid_state"
  | "transition_not_allowed"
  | "reason_required"
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

function fail(what: string, error: { message: string; code?: string }, code: StationeryErrorCode = "database"): never {
  throw new StationeryRepositoryError(`${what}: ${error.message}`, code, error.code);
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

export function normalizeAreaName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export type RegisterInput = {
  ownerId: string;
  basics: StationeryBasics;
  service?: StationeryService;
  consent?: StationeryConsent;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** Cria a papelaria em `signup` e o vínculo `owner`. Sem o vínculo, a papelaria é removida. */
export async function registerStationery(
  client: SupabaseClient,
  input: RegisterInput,
): Promise<{ id: string; slug: string }> {
  const { basics, service, consent } = input;
  const base = slugify(basics.tradeName);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const { data, error } = await client
      .from("stationeries")
      .insert({
        slug,
        trade_name: basics.tradeName,
        legal_name: basics.legalName,
        cnpj: basics.cnpj,
        municipality_id: basics.municipalityId,
        neighborhood: basics.neighborhood,
        address: basics.address ?? null,
        cep: basics.cep ?? null,
        ...(service ? serviceColumns(service) : {}),
        ...(consent
          ? { lgpd_accepted_at: new Date().toISOString(), lgpd_text_version: consent.lgpdTextVersion }
          : {}),
      })
      .select("id, slug")
      .single();
    if (error) {
      if (error.code === "23505") {
        if (error.message.includes("cnpj")) fail("cadastrar papelaria", error, "cnpj_taken");
        if (error.message.includes("slug")) continue; // colisão de slug: tenta com sufixo
      }
      fail("cadastrar papelaria", error);
    }
    const created = z.object({ id: z.uuid(), slug: z.string() }).parse(data);
    const member = await client
      .from("stationery_members")
      .insert({ stationery_id: created.id, profile_id: input.ownerId, member_role: "owner" });
    if (member.error) {
      const del = await client.from("stationeries").delete().eq("id", created.id);
      const cleanup = del.error ? ` (limpeza falhou: ${del.error.message})` : "";
      if (member.error.code === "23505") {
        throw new StationeryRepositoryError(`usuário já é dono de uma papelaria${cleanup}`, "already_owner", "23505");
      }
      fail(`vincular dono${cleanup}`, member.error);
    }
    if (service && service.areas.length > 0) {
      await replaceAreas(client, created.id, basics.municipalityId, service.areas);
    }
    return created;
  }
  throw new StationeryRepositoryError("não foi possível gerar um slug único", "database");
}

function serviceColumns(s: StationeryService): Record<string, unknown> {
  return {
    whatsapp: s.whatsapp,
    phone: s.phone ?? null,
    email: s.email ?? null,
    offers_pickup: s.offersPickup,
    offers_delivery: s.offersDelivery,
    service_radius_km: s.serviceRadiusKm,
    opening_hours: s.openingHours ?? null,
    payment_methods: s.paymentMethods,
  };
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

export type ProfilePatch = Partial<Omit<StationeryBasics, "cnpj" | "municipalityId">> &
  Partial<Omit<StationeryService, "areas">> & { cnpj?: string };

const PATCH_COLUMNS: Record<string, string> = {
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

/** Dono edita o cadastro (nunca status, slug ou `is_demo`). O banco recusa `cnpj` depois do envio para análise. */
export async function updateProfile(
  client: SupabaseClient,
  stationeryId: string,
  actorId: string,
  patch: ProfilePatch,
): Promise<void> {
  await loadOwned(client, stationeryId, actorId, OWNER_EDITABLE_STATUSES);
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = PATCH_COLUMNS[key];
    if (column && value !== undefined) columns[column] = value;
  }
  if (Object.keys(columns).length === 0) return;
  const { error } = await client.from("stationeries").update(columns).eq("id", stationeryId);
  if (error) fail("atualizar cadastro", error, error.code === "42501" ? "forbidden" : "database");
}

async function replaceAreas(
  client: SupabaseClient,
  stationeryId: string,
  municipalityId: string,
  neighborhoods: readonly string[],
): Promise<void> {
  const wanted = [...new Set(neighborhoods.map(normalizeAreaName).filter((n) => n !== ""))];
  const existing = await client
    .from("stationery_areas")
    .select("id, neighborhood")
    .eq("stationery_id", stationeryId)
    .eq("municipality_id", municipalityId);
  if (existing.error) fail("ler áreas", existing.error);
  const have = new Map((existing.data ?? []).map((r) => [String(r.neighborhood), String(r.id)]));
  const stale = [...have].filter(([n]) => !wanted.includes(n)).map(([, id]) => id);
  if (stale.length > 0) {
    const del = await client.from("stationery_areas").delete().in("id", stale);
    if (del.error) fail("remover áreas", del.error);
  }
  const fresh = wanted.filter((n) => !have.has(n));
  if (fresh.length > 0) {
    const ins = await client
      .from("stationery_areas")
      .insert(fresh.map((neighborhood) => ({ stationery_id: stationeryId, municipality_id: municipalityId, neighborhood })));
    if (ins.error) fail("gravar áreas", ins.error);
  }
}

/** Substitui os bairros atendidos (do município da papelaria). */
export async function setAreas(
  client: SupabaseClient,
  stationeryId: string,
  actorId: string,
  neighborhoods: readonly string[],
): Promise<void> {
  const { municipalityId } = await loadOwned(client, stationeryId, actorId, AREAS_WRITABLE_STATUSES);
  await replaceAreas(client, stationeryId, municipalityId, neighborhoods);
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

const UPSERT_CHUNK = 500;

/**
 * Insere ou atualiza itens por (papelaria, item_key). Idempotente: repetir o envio não duplica linhas e
 * renova `updated_at` (data do preço informado). Nome repetido no lote: vale o último.
 */
export async function upsertCatalogItems(
  client: SupabaseClient,
  stationeryId: string,
  actorId: string,
  items: readonly CatalogItemInput[],
): Promise<{ upserted: number }> {
  await loadOwned(client, stationeryId, actorId, CATALOG_WRITABLE_STATUSES);
  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of items) {
    const parsed = CatalogItemInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StationeryRepositoryError(`item inválido: ${parsed.error.issues[0]?.message ?? ""}`, "invalid_input");
    }
    const key = catalogItemKey(parsed.data.name);
    byKey.set(key, {
      stationery_id: stationeryId,
      name: parsed.data.name,
      item_key: key,
      price_cents: parsed.data.priceCents,
      price_source: CATALOG_PRICE_SOURCE,
      stock_status: parsed.data.stock,
      is_active: true,
    });
  }
  const rows = [...byKey.values()];
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await client
      .from("catalog_items")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "stationery_id,item_key" });
    if (error) fail("gravar catálogo", error);
  }
  return { upserted: rows.length };
}

export type CatalogRow = {
  id: string;
  name: string;
  itemKey: string;
  priceCents: number;
  priceSource: string;
  stock: CatalogStock;
  isActive: boolean;
  updatedAt: Date;
};

const catalogRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  item_key: z.string(),
  price_cents: z.number().int(),
  price_source: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  is_active: z.boolean(),
  updated_at: z.string(),
});
const mapCatalog = (r: z.output<typeof catalogRowSchema>): CatalogRow => ({
  id: r.id,
  name: r.name,
  itemKey: r.item_key,
  priceCents: r.price_cents,
  priceSource: r.price_source,
  stock: r.stock_status,
  isActive: r.is_active,
  updatedAt: new Date(r.updated_at),
});
const CATALOG_COLUMNS = "id, name, item_key, price_cents, price_source, stock_status, is_active, updated_at";

/** Catálogo da papelaria (todos os itens, para o dono). */
export async function listCatalogItems(
  client: SupabaseClient,
  stationeryId: string,
  actorId: string,
): Promise<CatalogRow[]> {
  await loadOwned(client, stationeryId, actorId, STATIONERY_STATUSES);
  const { data, error } = await client
    .from("catalog_items")
    .select(CATALOG_COLUMNS)
    .eq("stationery_id", stationeryId)
    .order("name")
    .limit(2000);
  if (error) fail("listar catálogo", error);
  return (data ?? []).map((r) => mapCatalog(catalogRowSchema.parse(r)));
}

// ---------------------------------------------------------------------------
// Transição de status
// ---------------------------------------------------------------------------

/** Única porta de escrita de status: a função SQL aplica a matriz, o motivo e as pré-condições. */
export async function transition(
  client: SupabaseClient,
  input: { id: string; to: StationeryStatus; actorId: string | null; actorRole: TransitionActor; reason?: string },
): Promise<StationeryStatus> {
  const { data, error } = await client.rpc("stationery_transition", {
    p_id: input.id,
    p_to: input.to,
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole,
    p_reason: input.reason ?? null,
  });
  if (error) {
    const code: StationeryErrorCode =
      error.code === "P0002"
        ? "not_found"
        : error.code === "42501"
          ? "forbidden"
          : error.code === "22023"
            ? "reason_required"
            : error.code === "23514"
              ? "transition_not_allowed"
              : "database";
    fail("transição de status", error, code);
  }
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
    client.from("stationery_areas").select("neighborhood").eq("stationery_id", p.id).order("neighborhood"),
    client.from("catalog_items").select(CATALOG_COLUMNS).eq("stationery_id", p.id).eq("is_active", true).order("name").limit(2000),
  ]);
  if (areas.error) fail("ler áreas", areas.error);
  if (catalog.error) fail("ler catálogo", catalog.error);
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
    areas: (areas.data ?? []).map((a) => String(a.neighborhood)),
    catalog: (catalog.data ?? []).map((r) => mapCatalog(catalogRowSchema.parse(r))),
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
  updated_at: z.string(),
  stationeries: z.object({
    status: z.string(),
    municipality_id: z.uuid(),
    neighborhood: z.string().nullable(),
    is_demo: z.boolean(),
    stationery_areas: z.array(z.object({ municipality_id: z.uuid(), neighborhood: z.string() })),
  }),
});

const CANDIDATE_LIMIT = 1000;

/** Implementa `LocalCatalogSource` sobre o banco (papelarias `active` do município, itens ativos pedidos). */
export function createLocalCatalogSource(client: SupabaseClient): LocalCatalogSource {
  return {
    async findCandidates(query: { itemKeys: readonly string[]; location: LocalLocation }, options) {
      const q = client
        .from("catalog_items")
        .select(
          "stationery_id, item_key, price_cents, price_source, stock_status, is_active, updated_at, stationeries!inner(status, municipality_id, neighborhood, is_demo, stationery_areas(municipality_id, neighborhood))",
        )
        .in("item_key", [...query.itemKeys])
        .eq("is_active", true)
        .eq("stationeries.status", "active")
        .limit(CANDIDATE_LIMIT);
      const { data, error } = await (options?.signal ? q.abortSignal(options.signal) : q);
      if (error) fail("buscar catálogo local", error);
      return (data ?? []).map((raw): LocalCatalogCandidate => {
        const r = candidateSchema.parse(raw);
        return {
          stationeryId: r.stationery_id,
          status: r.stationeries.status,
          municipalityId: r.stationeries.municipality_id,
          neighborhood: r.stationeries.neighborhood,
          isDemo: r.stationeries.is_demo,
          areas: r.stationeries.stationery_areas.map((a) => ({
            municipalityId: a.municipality_id,
            neighborhood: a.neighborhood,
          })),
          itemKey: r.item_key,
          priceCents: r.price_cents,
          priceSource: r.price_source,
          stock: r.stock_status,
          itemActive: r.is_active,
          updatedAt: new Date(r.updated_at),
        };
      });
    },
  };
}
