import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/stationeries/actor";
import { normalizeNeighborhood } from "@/features/stationeries/neighborhood";
import type { LocalCatalogCandidate } from "@/features/stationeries/ports";
import { createLocalCatalogSource } from "@/features/stationeries/repository";
import { servesLocation } from "@/features/stationeries/local-quote-provider";

import { normalizeLeadCode } from "./code";
import { LeadError, type LeadErrorCode } from "./errors";
import type { LeadStore, NewLeadRecord, PublicStationery, RequesterLead, TransitionRequest } from "./ports";
import { CLOSE_REASONS, LEAD_STATUSES, type CloseReason, type LeadStatus } from "./state";

// Escritas: SEMPRE pelas funções SQL (service_role, EXECUTE só dele), que conferem quem é o ator dentro da transação.
// Leituras da papelaria: cliente da SESSÃO do usuário (RLS + grants por coluna: sem requester_id, cart_id, consent_*,
// idempotency_key, actor_id nem reason). Leituras do solicitante: service_role (cart_id e reason não são legíveis por
// `authenticated`), SEMPRE com filtro explícito `requester_id = actor.userId` e colunas nomeadas (nunca `select *`).

const HINT_CODES: ReadonlySet<string> = new Set<LeadErrorCode>([
  "forbidden",
  "invalid_state",
  "transition_not_allowed",
  "rate_limited",
  "stationery_unavailable",
  "out_of_area",
  "expired",
  "amount_invalid",
  "reason_required",
  "actor_invalid",
  "limit_exceeded",
  "consent_required",
  "invalid_input",
  "not_found",
]);

function dbErrorCode(error: { code?: string; hint?: string | null }): LeadErrorCode {
  if (error.hint && HINT_CODES.has(error.hint)) return error.hint as LeadErrorCode;
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514":
      return "invalid_input";
    case "54000":
      return "limit_exceeded";
    default:
      return "database";
  }
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, override?: LeadErrorCode): never {
  throw new LeadError(`${what}: ${error.message}`, override ?? dbErrorCode(error), error.code);
}

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new LeadError("ator não vem da sessão", "forbidden");
}

function requireCode(code: string): string {
  const normalized = normalizeLeadCode(code);
  if (normalized === null) throw new LeadError("código inválido", "not_found");
  return normalized;
}

const statusSchema = z.enum(LEAD_STATUSES);
const date = z.string().transform((s) => new Date(s));
const nullableDate = z.string().nullable().transform((s) => (s === null ? null : new Date(s)));

// ---------------------------------------------------------------------------
// Escritas (funções SQL)
// ---------------------------------------------------------------------------

const createdSchema = z.array(z.object({ lead_id: z.uuid(), code: z.string(), created: z.boolean() })).length(1);

/** Cria o lead (idempotente pela chave). Só `parent`; a checagem final (carrinho, área, limites) é da função SQL. */
export async function createLead(
  admin: SupabaseClient,
  actor: SessionActor,
  record: NewLeadRecord,
): Promise<{ leadId: string; code: string; created: boolean }> {
  requireActor(actor);
  if (actor.role !== "parent") throw new LeadError("só responsável pede cotação", "forbidden");
  const { data, error } = await admin.rpc("lead_create", {
    p_requester_id: actor.userId,
    p_cart_id: record.cartId,
    p_list_id: record.listId,
    p_stationery_id: record.stationeryId,
    p_school_name: record.schoolName,
    p_grade_label: record.gradeLabel,
    p_school_year: record.schoolYear,
    p_municipality_id: record.municipalityId,
    p_neighborhood: record.neighborhood,
    p_items: record.items.map((i) => ({ name: i.name, item_key: i.itemKey, quantity: i.quantity })),
    p_consent_text_version: record.consentTextVersion,
    p_idempotency_key: record.idempotencyKey,
    p_is_demo: record.isDemo,
  });
  if (error) fail("criar lead", error);
  const row = createdSchema.parse(data)[0];
  if (!row) throw new LeadError("lead não devolvido", "database");
  return { leadId: row.lead_id, code: row.code, created: row.created };
}

/** Código -> id (service_role). Ausente = `not_found`; a autorização é da função SQL que recebe o id. */
async function resolveLeadId(admin: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await admin.from("leads").select("id").eq("code", requireCode(code)).maybeSingle();
  if (error) fail("ler lead", error);
  if (!data) throw new LeadError("lead não encontrado", "not_found");
  return z.uuid().parse(data.id);
}

/** Para quem consulta por código, "sem permissão" e "não existe" são a mesma resposta (não revela códigos alheios). */
function hideForeign<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (error instanceof LeadError && error.code === "forbidden") throw new LeadError("lead não encontrado", "not_found", error.dbCode);
    throw error;
  });
}

/**
 * Muda o status (`lead_transition`). Devolve o status FINAL: lead vencido vira `expired` sem erro (mesmo contrato da
 * expiração preguiçosa); quem chama compara com o pedido. `as: 'admin'` exige papel admin na sessão.
 */
export async function transitionLead(admin: SupabaseClient, actor: SessionActor, request: TransitionRequest): Promise<LeadStatus> {
  requireActor(actor);
  if (request.as === "admin" && actor.role !== "admin") throw new LeadError("só a equipe cancela por abuso", "forbidden");
  return hideForeign(async () => {
    const leadId = await resolveLeadId(admin, request.code);
    const { data, error } = await admin.rpc("lead_transition", {
      p_lead_id: leadId,
      p_to: request.to,
      p_actor_id: actor.userId,
      p_actor_role: request.as,
      p_amount_cents: request.amountCents ?? null,
      p_reason: request.reason ?? null,
    });
    if (error) fail("mudar status do lead", error);
    return statusSchema.parse(data);
  });
}

/** A papelaria abriu o lead: `received -> viewed` uma vez (idempotente). Devolve o status atual. */
export async function markViewed(admin: SupabaseClient, actor: SessionActor, code: string): Promise<LeadStatus> {
  requireActor(actor);
  return hideForeign(async () => {
    const leadId = await resolveLeadId(admin, code);
    const { data, error } = await admin.rpc("lead_mark_viewed", { p_lead_id: leadId, p_actor_id: actor.userId });
    if (error) fail("marcar lead como visto", error);
    return statusSchema.parse(data);
  });
}

/** O solicitante abriu o wa.me. `false` = deduplicado (60 s). */
export async function recordWhatsappOpen(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<boolean> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_record_whatsapp_open", { p_lead_id: z.uuid().parse(leadId), p_actor_id: actor.userId });
  if (error) fail("registrar abertura do WhatsApp", error);
  return z.boolean().parse(data);
}

/** Job de expiração (sem ator: roda no cron autenticado por segredo). Devolve quantos expirou. */
export async function expireDue(admin: SupabaseClient, limit = 500): Promise<number> {
  const { data, error } = await admin.rpc("lead_expire_due", { p_limit: limit });
  if (error) fail("expirar leads", error);
  return z.number().int().nonnegative().parse(data);
}

// ---------------------------------------------------------------------------
// Leituras do solicitante (service_role, filtro explícito pelo dono)
// ---------------------------------------------------------------------------

const REQUESTER_COLUMNS =
  "id, code, status, stationery_id, cart_id, list_id, school_name, grade_label, school_year, item_count, expires_at, quoted_total_cents, quoted_at, is_demo, created_at";

const requesterRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: statusSchema,
  stationery_id: z.uuid(),
  cart_id: z.uuid().nullable(),
  list_id: z.uuid(),
  school_name: z.string(),
  grade_label: z.string(),
  school_year: z.number().int(),
  item_count: z.number().int(),
  expires_at: date,
  quoted_total_cents: z.number().int().nullable(),
  quoted_at: nullableDate,
  is_demo: z.boolean(),
  created_at: date,
});

export type RequesterLeadRow = RequesterLead & {
  quotedTotalCents: number | null;
  quotedAt: Date | null;
  stationeryName: string | null;
  isDemo: boolean;
};

function mapRequester(r: z.output<typeof requesterRowSchema>, names: ReadonlyMap<string, string>): RequesterLeadRow {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    stationeryId: r.stationery_id,
    cartId: r.cart_id,
    listId: r.list_id,
    schoolName: r.school_name,
    gradeLabel: r.grade_label,
    schoolYear: r.school_year,
    itemCount: r.item_count,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    quotedTotalCents: r.quoted_total_cents,
    quotedAt: r.quoted_at,
    stationeryName: names.get(r.stationery_id) ?? null,
    isDemo: r.is_demo,
  };
}

/** Nome público das papelarias `active`; papelaria pausada/suspensa fica sem nome (nunca inventado). */
async function stationeryNames(admin: SupabaseClient, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await admin.from("stationery_public").select("id, trade_name").in("id", unique);
  if (error) fail("ler papelarias", error);
  return new Map(z.array(z.object({ id: z.uuid(), trade_name: z.string() })).parse(data ?? []).map((r) => [r.id, r.trade_name]));
}

export const REQUESTER_LIST_LIMIT = 100;

/** Cotações do solicitante (mais novas primeiro). */
export async function listForRequester(admin: SupabaseClient, actor: SessionActor): Promise<RequesterLeadRow[]> {
  requireActor(actor);
  const { data, error } = await admin
    .from("leads")
    .select(REQUESTER_COLUMNS)
    .eq("requester_id", actor.userId)
    .order("created_at", { ascending: false })
    .limit(REQUESTER_LIST_LIMIT);
  if (error) fail("listar cotações", error);
  const rows = z.array(requesterRowSchema).parse(data ?? []);
  const names = await stationeryNames(admin, rows.map((r) => r.stationery_id));
  return rows.map((r) => mapRequester(r, names));
}

/** Um lead do solicitante por código; alheio e inexistente são o mesmo `null`. */
export async function getForRequester(admin: SupabaseClient, actor: SessionActor, code: string): Promise<RequesterLead | null> {
  const row = await getRequesterRow(admin, actor, code);
  return row ? toRequesterLead(row) : null;
}

function toRequesterLead(row: RequesterLeadRow): RequesterLead {
  const { quotedTotalCents: _q, quotedAt: _a, stationeryName: _n, isDemo: _d, ...lead } = row;
  void [_q, _a, _n, _d];
  return lead;
}

async function getRequesterRow(admin: SupabaseClient, actor: SessionActor, code: string): Promise<RequesterLeadRow | null> {
  requireActor(actor);
  const normalized = normalizeLeadCode(code);
  if (normalized === null) return null;
  const { data, error } = await admin
    .from("leads")
    .select(REQUESTER_COLUMNS)
    .eq("code", normalized)
    .eq("requester_id", actor.userId)
    .maybeSingle();
  if (error) fail("ler cotação", error);
  if (!data) return null;
  const row = requesterRowSchema.parse(data);
  return mapRequester(row, await stationeryNames(admin, [row.stationery_id]));
}

export type LeadItemRow = { position: number; name: string; itemKey: string; quantity: number };
export type LeadEventRow = {
  id: string;
  eventType: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  actorRole: string;
  amountCents: number | null;
  /** Só na visão do solicitante (o texto do admin ao cancelar não vai para a papelaria). */
  reason?: string | null;
  createdAt: Date;
};

const itemSchema = z.object({ position: z.number().int(), name: z.string(), item_key: z.string(), quantity: z.number().int() });
const mapItem = (r: z.output<typeof itemSchema>): LeadItemRow => ({ position: r.position, name: r.name, itemKey: r.item_key, quantity: r.quantity });

const eventSchema = z.object({
  id: z.uuid(),
  event_type: z.string(),
  from_status: statusSchema.nullable(),
  to_status: statusSchema.nullable(),
  actor_role: z.string(),
  amount_cents: z.number().int().nullable(),
  reason: z.string().nullable().optional(),
  created_at: date,
});
const mapEvent = (r: z.output<typeof eventSchema>): LeadEventRow => ({
  id: r.id,
  eventType: r.event_type,
  fromStatus: r.from_status,
  toStatus: r.to_status,
  actorRole: r.actor_role,
  amountCents: r.amount_cents,
  ...(r.reason !== undefined ? { reason: r.reason } : {}),
  createdAt: r.created_at,
});

export type RequesterDetail = { lead: RequesterLeadRow; items: LeadItemRow[]; events: LeadEventRow[] };

/** Cotação do solicitante com itens e linha do tempo (inclui o `reason` do evento, lido por service_role). */
export async function getRequesterDetail(admin: SupabaseClient, actor: SessionActor, code: string): Promise<RequesterDetail | null> {
  const lead = await getRequesterRow(admin, actor, code);
  if (!lead) return null;
  const [items, events] = await Promise.all([
    admin.from("lead_items").select("position, name, item_key, quantity").eq("lead_id", lead.id).order("position").limit(300),
    admin
      .from("lead_events")
      .select("id, event_type, from_status, to_status, actor_role, amount_cents, reason, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (items.error) fail("ler itens do lead", items.error);
  if (events.error) fail("ler eventos do lead", events.error);
  return {
    lead,
    items: z.array(itemSchema).parse(items.data ?? []).map(mapItem),
    events: z.array(eventSchema).parse(events.data ?? []).map(mapEvent),
  };
}

// ---------------------------------------------------------------------------
// Leituras da papelaria (cliente da SESSÃO: RLS + grants por coluna)
// ---------------------------------------------------------------------------

const STATIONERY_COLUMNS =
  "id, code, status, list_id, stationery_id, school_name, grade_label, school_year, neighborhood, item_count, expires_at, quoted_total_cents, quoted_at, declared_sale_cents, declared_at, close_reason, is_demo, created_at";

const stationeryRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: statusSchema,
  list_id: z.uuid(),
  stationery_id: z.uuid(),
  school_name: z.string(),
  grade_label: z.string(),
  school_year: z.number().int(),
  neighborhood: z.string().nullable(),
  item_count: z.number().int(),
  expires_at: date,
  quoted_total_cents: z.number().int().nullable(),
  quoted_at: nullableDate,
  declared_sale_cents: z.number().int().nullable(),
  declared_at: nullableDate,
  close_reason: z.enum(CLOSE_REASONS).nullable(),
  is_demo: z.boolean(),
  created_at: date,
  lead_events: z.array(z.object({ created_at: date })).optional(),
});

/** Lead como a papelaria o vê: nenhum campo que identifique o responsável. */
export type StationeryLead = {
  id: string;
  code: string;
  status: LeadStatus;
  listId: string;
  stationeryId: string;
  schoolName: string;
  gradeLabel: string;
  schoolYear: number;
  neighborhood: string | null;
  itemCount: number;
  expiresAt: Date;
  quotedTotalCents: number | null;
  quotedAt: Date | null;
  declaredSaleCents: number | null;
  declaredAt: Date | null;
  closeReason: CloseReason | null;
  isDemo: boolean;
  createdAt: Date;
  /** Data do evento `sale_declared` (para os KPIs). */
  saleDeclaredAt: Date | null;
};

function mapStationery(r: z.output<typeof stationeryRowSchema>): StationeryLead {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    listId: r.list_id,
    stationeryId: r.stationery_id,
    schoolName: r.school_name,
    gradeLabel: r.grade_label,
    schoolYear: r.school_year,
    neighborhood: r.neighborhood,
    itemCount: r.item_count,
    expiresAt: r.expires_at,
    quotedTotalCents: r.quoted_total_cents,
    quotedAt: r.quoted_at,
    declaredSaleCents: r.declared_sale_cents,
    declaredAt: r.declared_at,
    closeReason: r.close_reason,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    saleDeclaredAt: r.lead_events?.[0]?.created_at ?? null,
  };
}

export const STATIONERY_LIST_LIMIT = 500;

/** Leads da papelaria (mais novos primeiro). `truncated` avisa que passou do limite (nunca corte silencioso). */
export async function listForStationery(
  userClient: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
): Promise<{ rows: StationeryLead[]; truncated: boolean }> {
  requireActor(actor);
  const { data, error } = await userClient
    .from("leads")
    .select(`${STATIONERY_COLUMNS}, lead_events(created_at)`)
    .eq("stationery_id", z.uuid().parse(stationeryId))
    .eq("lead_events.event_type", "sale_declared")
    .order("created_at", { ascending: false })
    .limit(STATIONERY_LIST_LIMIT + 1);
  if (error) fail("listar leads", error);
  const all = z.array(stationeryRowSchema).parse(data ?? []).map(mapStationery);
  return { rows: all.slice(0, STATIONERY_LIST_LIMIT), truncated: all.length > STATIONERY_LIST_LIMIT };
}

export type StationeryLeadDetail = { lead: StationeryLead; items: LeadItemRow[]; events: LeadEventRow[] };

/** Um lead da papelaria por código, com itens e eventos (sem `reason`). Alheio e inexistente: `null`. */
export async function getForStationery(
  userClient: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  code: string,
): Promise<StationeryLeadDetail | null> {
  requireActor(actor);
  const normalized = normalizeLeadCode(code);
  if (normalized === null) return null;
  const { data, error } = await userClient
    .from("leads")
    .select(`${STATIONERY_COLUMNS}, lead_events(created_at)`)
    .eq("code", normalized)
    .eq("stationery_id", z.uuid().parse(stationeryId))
    .eq("lead_events.event_type", "sale_declared")
    .maybeSingle();
  if (error) fail("ler lead", error);
  if (!data) return null;
  const lead = mapStationery(stationeryRowSchema.parse(data));
  const [items, events] = await Promise.all([
    userClient.from("lead_items").select("position, name, item_key, quantity").eq("lead_id", lead.id).order("position").limit(300),
    userClient
      .from("lead_events")
      .select("id, event_type, from_status, to_status, actor_role, amount_cents, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (items.error) fail("ler itens do lead", items.error);
  if (events.error) fail("ler eventos do lead", events.error);
  return {
    lead,
    items: z.array(itemSchema).parse(items.data ?? []).map(mapItem),
    events: z.array(eventSchema).parse(events.data ?? []).map(mapEvent),
  };
}

// ---------------------------------------------------------------------------
// Papelarias (escolha do solicitante) e contato público
// ---------------------------------------------------------------------------

const publicSchema = z.object({
  id: z.uuid(),
  trade_name: z.string(),
  municipality_id: z.uuid(),
  whatsapp: z.string().nullable(),
  is_demo: z.boolean(),
});

/** Papelaria `active` (view pública). Qualquer outro status: `null`. */
export async function getStationeryPublic(admin: SupabaseClient, stationeryId: string): Promise<PublicStationery | null> {
  const { data, error } = await admin
    .from("stationery_public")
    .select("id, trade_name, municipality_id, whatsapp, is_demo")
    .eq("id", z.uuid().parse(stationeryId))
    .maybeSingle();
  if (error) fail("ler papelaria", error);
  if (!data) return null;
  const r = publicSchema.parse(data);
  return { id: r.id, name: r.trade_name, municipalityId: r.municipality_id, whatsapp: r.whatsapp, isDemo: r.is_demo };
}

export type StationeryOption = {
  id: string;
  slug: string;
  name: string;
  neighborhood: string | null;
  offersPickup: boolean;
  offersDelivery: boolean;
  paymentMethods: string[];
  isDemo: boolean;
  /** Linhas de catálogo (dos itens pedidos) desta papelaria, para `estimateFromCatalog`. */
  candidates: LocalCatalogCandidate[];
};

export const OPTION_LIMIT = 50;

const optionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  trade_name: z.string(),
  municipality_id: z.uuid(),
  neighborhood: z.string().nullable(),
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  payment_methods: z.array(z.string()),
  is_demo: z.boolean(),
});

/** Papelarias `active` que atendem o local (mesma regra `servesLocation` da cotação local), com o catálogo dos itens. */
export async function listCandidateStationeries(
  admin: SupabaseClient,
  actor: SessionActor,
  query: { municipalityId: string; neighborhood?: string; itemKeys: readonly string[] },
): Promise<StationeryOption[]> {
  requireActor(actor);
  const municipalityId = z.uuid().parse(query.municipalityId);
  const [areasRes, inMuniRes] = await Promise.all([
    admin.from("stationery_areas").select("stationery_id, municipality_id, neighborhood").eq("municipality_id", municipalityId).limit(5000),
    admin
      .from("stationery_public")
      .select("id, slug, trade_name, municipality_id, neighborhood, offers_pickup, offers_delivery, payment_methods, is_demo")
      .eq("municipality_id", municipalityId)
      .limit(500),
  ]);
  if (areasRes.error) fail("ler áreas", areasRes.error);
  if (inMuniRes.error) fail("ler papelarias", inMuniRes.error);
  const areas = z
    .array(z.object({ stationery_id: z.uuid(), municipality_id: z.uuid(), neighborhood: z.string() }))
    .parse(areasRes.data ?? []);
  const byId = new Map(z.array(optionSchema).parse(inMuniRes.data ?? []).map((r) => [r.id, r]));
  const extraIds = [...new Set(areas.map((a) => a.stationery_id))].filter((id) => !byId.has(id));
  if (extraIds.length > 0) {
    const { data, error } = await admin
      .from("stationery_public")
      .select("id, slug, trade_name, municipality_id, neighborhood, offers_pickup, offers_delivery, payment_methods, is_demo")
      .in("id", extraIds);
    if (error) fail("ler papelarias", error);
    for (const r of z.array(optionSchema).parse(data ?? [])) byId.set(r.id, r);
  }

  const location = { municipalityId, ...(query.neighborhood ? { neighborhood: query.neighborhood } : {}) };
  const candidates = await createLocalCatalogSource(admin).findCandidates({ itemKeys: [...new Set(query.itemKeys)], location });
  const options: StationeryOption[] = [];
  for (const r of byId.values()) {
    const own = areas.filter((a) => a.stationery_id === r.id).map((a) => ({ municipalityId: a.municipality_id, neighborhood: a.neighborhood }));
    // sentinela só para reaproveitar `servesLocation` (a regra de área é uma só)
    const probe: LocalCatalogCandidate = {
      stationeryId: r.id,
      status: "active",
      municipalityId: r.municipality_id,
      neighborhood: r.neighborhood,
      isDemo: r.is_demo,
      areas: own,
      itemKey: "",
      priceCents: 1,
      priceSource: "",
      stock: "unknown",
      itemActive: true,
      priceUpdatedAt: new Date(0),
    };
    if (!servesLocation(probe, location)) continue;
    options.push({
      id: r.id,
      slug: r.slug,
      name: r.trade_name,
      neighborhood: r.neighborhood === null ? null : normalizeNeighborhood(r.neighborhood) === "" ? null : r.neighborhood,
      offersPickup: r.offers_pickup,
      offersDelivery: r.offers_delivery,
      paymentMethods: r.payment_methods,
      isDemo: r.is_demo,
      candidates: candidates.filter((c) => c.stationeryId === r.id),
    });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).slice(0, OPTION_LIMIT);
}

// ---------------------------------------------------------------------------
// Porta usada pelo serviço
// ---------------------------------------------------------------------------

export function createLeadStore(admin: SupabaseClient): LeadStore {
  return {
    createLead: (actor, record) => createLead(admin, actor, record),
    getStationeryPublic: (id) => getStationeryPublic(admin, id),
    getForRequester: (actor, code) => getForRequester(admin, actor, code),
    transitionLead: (actor, request) => transitionLead(admin, actor, request),
    markViewed: (actor, code) => markViewed(admin, actor, code),
    recordWhatsappOpen: (actor, leadId) => recordWhatsappOpen(admin, actor, leadId),
  };
}
