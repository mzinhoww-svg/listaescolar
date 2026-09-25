import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeItemKey } from "./item-key";
import {
  retailerRowSchema,
  snapshotRowSchema,
  type RetailerRow,
  type SnapshotRow,
} from "./schemas";
import type { CartOption, CartStrategy } from "./types";

// Todas as funções recebem o cliente (do usuário, para valer a RLS; ou admin, em rotinas de servidor).

export type CartItemRow = {
  id: string;
  listItemId: string | null;
  name: string;
  itemKey: string;
  quantity: number;
};
export type CartRow = {
  id: string;
  ownerId: string;
  listId: string | null;
  strategy: CartStrategy;
  isDemo: boolean;
  items: CartItemRow[];
};

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

function fail(what: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${what}: ${error.message}`, error.code);
}

const RETAILER_COLUMNS = "id, slug, name, base_url, search_url_template, affiliate_kind, is_active";

function mapRetailer(row: Record<string, unknown>): RetailerRow {
  return retailerRowSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    baseUrl: row.base_url,
    searchUrlTemplate: row.search_url_template,
    affiliateKind: row.affiliate_kind,
    isActive: row.is_active,
  });
}

export async function listActiveRetailers(client: SupabaseClient): Promise<RetailerRow[]> {
  const { data, error } = await client
    .from("retailers")
    .select(RETAILER_COLUMNS)
    .eq("is_active", true)
    .order("slug");
  if (error) fail("listar varejistas", error);
  return (data ?? []).map(mapRetailer);
}

/** Só varejista ativo; desconhecido ou inativo → null. */
export async function getActiveRetailerBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<RetailerRow | null> {
  const { data, error } = await client
    .from("retailers")
    .select(RETAILER_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) fail("ler varejista", error);
  return data ? mapRetailer(data) : null;
}

export type NewCartInput = {
  ownerId: string;
  listId: string | null;
  strategy?: CartStrategy;
  isDemo?: boolean;
  items: { listItemId?: string | null; name: string; quantity: number }[];
};

export async function createCart(client: SupabaseClient, input: NewCartInput): Promise<string> {
  const { data, error } = await client
    .from("carts")
    .insert({
      owner_id: input.ownerId,
      list_id: input.listId,
      strategy: input.strategy ?? "cheapest",
      is_demo: input.isDemo ?? false,
    })
    .select("id")
    .single();
  if (error) fail("criar carrinho", error);
  const cartId = z.uuid().parse(data.id);
  if (input.items.length > 0) {
    const { error: itemsError } = await client
      .from("cart_items")
      .insert(
        input.items.map((i) => ({
          cart_id: cartId,
          list_item_id: i.listItemId ?? null,
          name: i.name,
          quantity: i.quantity,
        })),
      );
    if (itemsError) {
      await client.from("carts").delete().eq("id", cartId); // sem carrinho pela metade
      fail("criar itens do carrinho", itemsError);
    }
  }
  return cartId;
}

/** Carrinho com itens; sem acesso (RLS) ou inexistente → null (não distingue os dois casos). */
export async function getCart(client: SupabaseClient, cartId: string): Promise<CartRow | null> {
  const { data, error } = await client
    .from("carts")
    .select(
      "id, owner_id, list_id, strategy, is_demo, cart_items(id, list_item_id, name, quantity, created_at)",
    )
    .eq("id", cartId)
    .maybeSingle();
  if (error) fail("ler carrinho", error);
  if (!data) return null;
  const items = z
    .array(
      z.object({
        id: z.uuid(),
        list_item_id: z.uuid().nullable(),
        name: z.string(),
        quantity: z.number().int(),
        created_at: z.string(),
      }),
    )
    .parse(data.cart_items)
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1,
    );
  return {
    id: z.uuid().parse(data.id),
    ownerId: z.uuid().parse(data.owner_id),
    listId: z.uuid().nullable().parse(data.list_id),
    strategy: z
      .enum(["cheapest", "fewest_stores", "balanced", "local_stationery"])
      .parse(data.strategy),
    isDemo: z.boolean().parse(data.is_demo),
    items: items.map((i) => ({
      id: i.id,
      listItemId: i.list_item_id,
      name: i.name,
      itemKey: normalizeItemKey(i.name),
      quantity: i.quantity,
    })),
  };
}

/** Snapshots dos itens (todas as lojas ativas). O motor aplica frescor e validade. */
export async function getPriceSnapshots(
  client: SupabaseClient,
  itemKeys: string[],
): Promise<SnapshotRow[]> {
  if (itemKeys.length === 0) return [];
  const { data, error } = await client
    .from("price_snapshots")
    .select(
      "item_key, price_cents, source, checked_at, product_url, is_demo, retailers!inner(slug, is_active)",
    )
    .in("item_key", itemKeys)
    .eq("retailers.is_active", true)
    .order("checked_at", { ascending: false })
    .limit(2000);
  if (error) fail("ler preços", error);
  const rows: SnapshotRow[] = [];
  for (const raw of data ?? []) {
    const retailer = Array.isArray(raw.retailers) ? raw.retailers[0] : raw.retailers;
    const parsed = snapshotRowSchema.safeParse({
      retailerSlug: retailer?.slug,
      itemKey: raw.item_key,
      priceCents: raw.price_cents,
      source: raw.source,
      checkedAt: raw.checked_at,
      productUrl: raw.product_url,
      isDemo: raw.is_demo,
    });
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

export async function saveOptionsSnapshot(
  client: SupabaseClient,
  cartId: string,
  options: CartOption[],
): Promise<void> {
  const { error } = await client
    .from("carts")
    .update({ options_snapshot: JSON.parse(JSON.stringify(options)) })
    .eq("id", cartId);
  if (error) fail("salvar opções", error);
}

export type ClickInput = {
  cartId: string;
  retailerId: string;
  profileId: string;
  affiliateApplied: boolean;
  targetUrl: string;
};

/** Cada clique é uma linha (clique duplo registra dois); a RLS exige carrinho e perfil do próprio usuário. */
export async function recordClick(client: SupabaseClient, input: ClickInput): Promise<string> {
  const { data, error } = await client
    .from("affiliate_clicks")
    .insert({
      cart_id: input.cartId,
      retailer_id: input.retailerId,
      profile_id: input.profileId,
      affiliate_applied: input.affiliateApplied,
      target_url: input.targetUrl,
    })
    .select("id")
    .single();
  if (error) fail("registrar clique", error);
  return z.uuid().parse(data.id);
}
