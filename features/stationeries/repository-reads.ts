import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fetchCatalog, type CatalogRow } from "./repository-catalog";
import { fail, statusSchema } from "./repository-shared";
import type { StationeryStatus } from "./state";

/**
 * Leitura (perfil público e visão do admin), extraída de `repository.ts` (D-057, S18): comportamento idêntico.
 */

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
