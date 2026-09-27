import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import { normalizeLeadCode } from "./code";
import type { RequesterLead } from "./ports";
import { date, eventSchema, fail, itemSchema, mapEvent, mapItem, nullableDate, requireActor, statusSchema, type LeadEventRow, type LeadItemRow } from "./repository-shared";

/**
 * Leituras do SOLICITANTE (service_role, SEMPRE com filtro explícito `requester_id = actor.userId`), extraídas de
 * `repository.ts` (D-057, S18) — comportamento idêntico ao arquivo original.
 */

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
