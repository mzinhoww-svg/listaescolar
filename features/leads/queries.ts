import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";
import type { AdminRow } from "@/features/stationeries/repository";
import type { LocalCatalogCandidate } from "@/features/stationeries/ports";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { estimateFromCatalog, type Estimate } from "./estimate";
import type { CartSnapshot, LeadListContext } from "./ports";
import {
  getForStationery,
  getRequesterDetail,
  listCandidateStationeries,
  listForRequester,
  listForStationery,
  type RequesterDetail,
  type RequesterLeadRow,
  type StationeryLead,
  type StationeryLeadDetail,
  type StationeryOption,
} from "./repository";
import { createCartReader, createContextReader } from "./wiring";

export type QuoteOptionView = StationeryOption & { estimate: Estimate };
export type QuoteView = { cart: CartSnapshot; context: LeadListContext; municipalityId: string; options: QuoteOptionView[] };
export type QuoteResult =
  | { status: "ok"; view: QuoteView }
  | { status: "not_found" }
  | { status: "unavailable" };

/** Município: o da escola quando o leitor sabe; senão o ÚNICO município habilitado (piloto); senão `null`. */
async function resolveMunicipality(context: LeadListContext): Promise<string | null> {
  if (context.municipalityId) return context.municipalityId;
  const { data, error } = await createAdminClient().from("municipalities").select("id").eq("is_enabled", true).limit(2);
  if (error) throw new Error(`ler municípios: ${error.message}`);
  const rows = z.array(z.object({ id: z.uuid() })).parse(data ?? []);
  return rows.length === 1 ? rows[0]!.id : null;
}

/** Opções de papelaria para o carrinho do PRÓPRIO solicitante (dono conferido pelo leitor de carrinho). */
export async function loadQuoteView(actor: SessionActor, cartId: string, neighborhood?: string): Promise<QuoteResult> {
  if (!z.uuid().safeParse(cartId).success) return { status: "not_found" };
  const cart = await createCartReader().getOwnedCart(actor, cartId);
  if (!cart) return { status: "not_found" };
  const contexts = createContextReader();
  if (cart.listId === null || contexts === null) return { status: "unavailable" };
  const context = await contexts.getContext(cart.listId);
  if (!context) return { status: "unavailable" };
  const municipalityId = await resolveMunicipality(context);
  if (municipalityId === null) return { status: "unavailable" };
  const stationeries = await listCandidateStationeries(createAdminClient(), actor, {
    municipalityId,
    itemKeys: cart.items.map((i) => i.itemKey),
    ...(neighborhood ? { neighborhood } : {}),
  });
  const now = new Date();
  const options = stationeries.map((o) => ({ ...o, estimate: estimateFromCatalog(cart.items, o.candidates, now) }));
  return { status: "ok", view: { cart, context, municipalityId, options } };
}

export async function listMyLeads(actor: SessionActor): Promise<RequesterLeadRow[]> {
  return listForRequester(createAdminClient(), actor);
}

export async function getMyLead(actor: SessionActor, code: string): Promise<RequesterDetail | null> {
  return getRequesterDetail(createAdminClient(), actor, code);
}

export async function listStationeryLeads(actor: SessionActor, stationeryId: string): Promise<{ rows: StationeryLead[]; truncated: boolean }> {
  return listForStationery(await createClient(), actor, stationeryId);
}

export async function getStationeryLead(actor: SessionActor, stationeryId: string, code: string): Promise<StationeryLeadDetail | null> {
  return getForStationery(await createClient(), actor, stationeryId, code);
}

const catalogRow = z.object({
  item_key: z.string(),
  price_cents: z.number().int(),
  price_source: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  is_active: z.boolean(),
  price_updated_at: z.coerce.date(),
});

/** Itens do lead × catálogo DA PRÓPRIA papelaria (cliente da sessão: RLS). Sem catálogo, "indisponível". */
export async function estimateOwnCatalog(
  stationery: Pick<AdminRow, "id" | "status">,
  items: readonly { itemKey: string; name: string; quantity: number }[],
): Promise<Estimate> {
  const keys = [...new Set(items.map((i) => i.itemKey))];
  let candidates: LocalCatalogCandidate[] = [];
  if (keys.length > 0) {
    const { data, error } = await (await createClient())
      .from("catalog_items")
      .select("item_key, price_cents, price_source, stock_status, is_active, price_updated_at")
      .eq("stationery_id", stationery.id)
      .in("item_key", keys)
      .limit(1000);
    if (error) throw new Error(`ler catálogo: ${error.message}`);
    candidates = z.array(catalogRow).parse(data ?? []).map((r) => ({
      stationeryId: stationery.id,
      status: stationery.status,
      municipalityId: "",
      neighborhood: null,
      isDemo: false,
      areas: [],
      itemKey: r.item_key,
      priceCents: r.price_cents,
      priceSource: r.price_source,
      stock: r.stock_status,
      itemActive: r.is_active,
      priceUpdatedAt: r.price_updated_at,
    }));
  }
  return estimateFromCatalog(items, candidates, new Date());
}
