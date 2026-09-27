import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";
import { normalizeNeighborhood } from "@/features/stationeries/neighborhood";
import type { LocalCatalogCandidate } from "@/features/stationeries/ports";
import { createLocalCatalogSource } from "@/features/stationeries/repository";
import { servesLocation } from "@/features/stationeries/local-quote-provider";

import type { LeadStore, PublicStationery } from "./ports";
import { fail, requireActor } from "./repository-shared";

/**
 * D-057 (S18): este arquivo tinha 632 linhas (escritas + 3 grupos de leitura + escolha de papelaria). Dividido em
 * arquivos-irmãos por responsabilidade (sugestão do próprio D-057): `repository-writes.ts` (funções SQL),
 * `repository-requester.ts` (leitura do solicitante), `repository-stationery.ts` (leitura da papelaria),
 * `repository-shared.ts` (erro/schema comuns). Este arquivo continua sendo o ÚNICO ponto de import
 * (`@/features/leads/repository`) — reexporta tudo dos irmãos e mantém só a seção "papelarias (escolha do
 * solicitante) e contato público" e `createLeadStore`, que não coube em nenhum dos três grupos.
 */
export * from "./repository-requester";
export * from "./repository-stationery";
export { expireDue } from "./repository-writes";
export type { LeadEventRow, LeadItemRow } from "./repository-shared";
import { createLead, markViewed, recordWhatsappOpen, transitionLead } from "./repository-writes";
export { createLead, markViewed, recordWhatsappOpen, transitionLead } from "./repository-writes";
import { getForRequester } from "./repository-requester";

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
  query: { municipalityId: string; neighborhood?: string; itemKeys: readonly string[]; itemCount: number },
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

  // S21: papelaria sem passe com cota, sem grátis e sem saldo não pode receber o lead — some da lista sem revelar o
  // motivo (o pai nunca vê "sem saldo"; a corrida cai em `billing_required` no lead_create se ela sair da lista tarde).
  const billable = await filterByCanReceiveLead(admin, options.map((o) => o.id), query.itemCount);
  return options
    .filter((o) => billable.has(o.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, OPTION_LIMIT);
}

const canReceiveRow = z.object({ stationery_id: z.uuid(), can_receive: z.boolean() });

/** IDs que `billing_can_receive_lead` (0401_billing.sql) autoriza para um lead com `itemCount` itens. */
async function filterByCanReceiveLead(admin: SupabaseClient, stationeryIds: string[], itemCount: number): Promise<Set<string>> {
  if (stationeryIds.length === 0) return new Set();
  const { data, error } = await admin.rpc("billing_can_receive_lead", { p_stationery_ids: stationeryIds, p_item_count: itemCount });
  if (error) fail("conferir cobrança das papelarias", error);
  return new Set(z.array(canReceiveRow).parse(data ?? []).filter((r) => r.can_receive).map((r) => r.stationery_id));
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
