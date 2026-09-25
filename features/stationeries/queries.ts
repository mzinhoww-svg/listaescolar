import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { getOwnStationery, type AdminRow } from "./repository";
import { STATIONERY_STATUSES, type StationeryStatus } from "./state";

// Leituras de servidor. As que usam o cliente de serviço só recebem ids que a página/ação já autorizou
// (dono pela sessão; admin pelo papel), nunca ids ou papéis vindos de input.

export type Municipality = { id: string; name: string; uf: string };

/** Municípios habilitados (dado, não código): RLS já filtra `is_enabled`. */
export async function listEnabledMunicipalities(): Promise<Municipality[]> {
  const client = await createClient();
  const { data, error } = await client.from("municipalities").select("id, name, uf").eq("is_enabled", true).order("name");
  if (error) throw new Error(`listar municípios: ${error.message}`);
  return z.array(z.object({ id: z.uuid(), name: z.string(), uf: z.string() })).parse(data ?? []);
}

/** Papelaria em que a pessoa autenticada é dona (o `userId` vem de `getCurrentUser`). */
export async function getStationeryOfOwner(userId: string): Promise<AdminRow | null> {
  return getOwnStationery(createAdminClient(), userId);
}

export type StatusEvent = {
  id: string;
  fromStatus: StationeryStatus;
  toStatus: StationeryStatus;
  actorRole: string;
  reason: string | null;
  createdAt: Date;
};

const statusEnum = z.enum(STATIONERY_STATUSES);
const eventSchema = z.object({
  id: z.uuid(),
  from_status: statusEnum,
  to_status: statusEnum,
  actor_role: z.string(),
  reason: z.string().nullable(),
  created_at: z.string(),
});

/** Histórico de status (só depois de autorizar dono ou admin). */
export async function listStatusEvents(stationeryId: string): Promise<StatusEvent[]> {
  const { data, error } = await createAdminClient()
    .from("stationery_status_events")
    .select("id, from_status, to_status, actor_role, reason, created_at")
    .eq("stationery_id", stationeryId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`listar eventos: ${error.message}`);
  return (data ?? []).map((raw) => {
    const r = eventSchema.parse(raw);
    return { id: r.id, fromStatus: r.from_status, toStatus: r.to_status, actorRole: r.actor_role, reason: r.reason, createdAt: new Date(r.created_at) };
  });
}

export async function listOwnAreas(stationeryId: string): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("stationery_areas")
    .select("neighborhood, display_name")
    .eq("stationery_id", stationeryId)
    .order("neighborhood");
  if (error) throw new Error(`listar bairros: ${error.message}`);
  return (data ?? []).map((r) => String(r.display_name ?? r.neighborhood)); // texto como o dono digitou
}

export type AdminListRow = {
  id: string;
  tradeName: string;
  cnpj: string;
  neighborhood: string | null;
  whatsapp: string | null;
  status: StationeryStatus;
  isDemo: boolean;
  createdAt: Date;
};

const listSchema = z.object({
  id: z.uuid(),
  trade_name: z.string(),
  cnpj: z.string(),
  neighborhood: z.string().nullable(),
  whatsapp: z.string().nullable(),
  status: statusEnum,
  is_demo: z.boolean(),
  created_at: z.string(),
});

/** Fila de papelarias para a equipe (a página confere o papel admin antes). */
export async function listAdminRows(): Promise<AdminListRow[]> {
  const { data, error } = await createAdminClient()
    .from("stationeries")
    .select("id, trade_name, cnpj, neighborhood, whatsapp, status, is_demo, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listar papelarias: ${error.message}`);
  return (data ?? []).map((raw) => {
    const r = listSchema.parse(raw);
    return { id: r.id, tradeName: r.trade_name, cnpj: r.cnpj, neighborhood: r.neighborhood, whatsapp: r.whatsapp, status: r.status, isDemo: r.is_demo, createdAt: new Date(r.created_at) };
  });
}

export type AdminDetail = AdminListRow & {
  slug: string;
  legalName: string | null;
  email: string | null;
  statusReason: string | null;
  offersPickup: boolean;
  offersDelivery: boolean;
  paymentMethods: string[];
  lgpdAcceptedAt: Date | null;
};

const detailSchema = listSchema.extend({
  slug: z.string(),
  legal_name: z.string().nullable(),
  email: z.string().nullable(),
  status_reason: z.string().nullable(),
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  payment_methods: z.array(z.string()),
  lgpd_accepted_at: z.string().nullable(),
});

export async function getAdminDetail(id: string): Promise<AdminDetail | null> {
  const { data, error } = await createAdminClient()
    .from("stationeries")
    .select("id, slug, trade_name, legal_name, cnpj, neighborhood, whatsapp, email, status, status_reason, is_demo, created_at, offers_pickup, offers_delivery, payment_methods, lgpd_accepted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`ler papelaria: ${error.message}`);
  if (!data) return null;
  const r = detailSchema.parse(data);
  return {
    id: r.id,
    slug: r.slug,
    tradeName: r.trade_name,
    legalName: r.legal_name,
    cnpj: r.cnpj,
    neighborhood: r.neighborhood,
    whatsapp: r.whatsapp,
    email: r.email,
    status: r.status,
    statusReason: r.status_reason,
    isDemo: r.is_demo,
    createdAt: new Date(r.created_at),
    offersPickup: r.offers_pickup,
    offersDelivery: r.offers_delivery,
    paymentMethods: r.payment_methods,
    lgpdAcceptedAt: r.lgpd_accepted_at ? new Date(r.lgpd_accepted_at) : null,
  };
}
