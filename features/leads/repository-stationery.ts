import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import { normalizeLeadCode } from "./code";
import { date, eventSchema, fail, itemSchema, mapEvent, mapItem, nullableDate, requireActor, statusSchema, type LeadEventRow, type LeadItemRow } from "./repository-shared";
import { CLOSE_REASONS, type CloseReason, type LeadStatus } from "./state";

/**
 * Leituras da PAPELARIA (cliente da SESSÃO: RLS + grants por coluna, sem `requester_id`/`cart_id`/`consent_*`/
 * `idempotency_key`/`actor_id`/`reason`), extraídas de `repository.ts` (D-057, S18) — comportamento idêntico.
 */

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
