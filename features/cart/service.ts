import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildRetailerRedirect, type AffiliateEnv } from "./affiliate";
import { createDemoRetailerProvider, isDemoEnabled, type DemoEnv } from "./demo-provider";
import { buildCartOptions } from "./options-engine";
import { createDemoListReader } from "./memory-list-reader";
import {
  getCart,
  getPriceSnapshots,
  listActiveRetailers,
  type CartItemRow,
  type CartRow,
} from "./repository";
import type { RetailerRow } from "./schemas";
import { SnapshotRetailerProvider } from "./snapshot-provider";
import { RedirectTargetError } from "./redirect-target";
import type { CartOption, Quote } from "./types";
import type { ListReader } from "./ports";

export type StoreInfo = {
  id: string;
  name: string;
  initials: string;
  /** Verdadeiro só quando o ID de afiliado existe de fato e entra no link. */
  affiliateApplied: boolean;
};

export type CartView = {
  cart: CartRow;
  options: CartOption[];
  stores: Record<string, StoreInfo>;
  retailers: RetailerRow[];
  /** Slugs de lojas com ao menos um clique registrado neste carrinho. */
  openedSlugs: string[];
};

export type ServiceEnv = DemoEnv & AffiliateEnv;

export function readServiceEnv(): ServiceEnv {
  return {
    DEMO_RETAILERS: process.env.DEMO_RETAILERS,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    MELI_AFFILIATE_ID: process.env.MELI_AFFILIATE_ID,
    MELI_AFFILIATE_WORD: process.env.MELI_AFFILIATE_WORD,
    AMAZON_ASSOCIATE_TAG: process.env.AMAZON_ASSOCIATE_TAG,
  };
}

/** Leitor de listas desta fatia: só o de demonstração (o real é ligado na S11). */
export function getListReader(env: ServiceEnv): ListReader | null {
  return createDemoListReader(env);
}

export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : Array.from(name).slice(0, 2);
  return letters.join("").toUpperCase();
}

export const LOCAL_STORE_PREFIX = "local:";

/** Item cuja busca a loja abre: o escolhido (se do carrinho) ou o primeiro do carrinho. */
export function pickItem(cart: CartRow, itemId: string | null | undefined): CartItemRow | null {
  return cart.items.find((i) => i.id === itemId) ?? cart.items[0] ?? null;
}

function storeInfo(
  retailer: RetailerRow,
  sampleItem: CartItemRow | null,
  env: AffiliateEnv,
): StoreInfo {
  let affiliateApplied = false;
  if (sampleItem) {
    try {
      affiliateApplied = buildRetailerRedirect(retailer, sampleItem.name, env).affiliateApplied;
    } catch (error) {
      if (!(error instanceof RedirectTargetError)) throw error;
    }
  }
  return {
    id: retailer.slug,
    name: retailer.name,
    initials: initialsOf(retailer.name),
    affiliateApplied,
  };
}

export async function collectQuotes(
  client: SupabaseClient,
  cart: CartRow,
  env: ServiceEnv,
  now: Date,
): Promise<Quote[]> {
  const demo = isDemoEnabled(env);
  const items = cart.items.map((i) => ({ itemKey: i.itemKey, name: i.name, quantity: i.quantity }));
  const snapshot = new SnapshotRetailerProvider(
    (keys) => getPriceSnapshots(client, keys, { now }),
    {
      includeDemo: demo,
    },
  );
  const providers = [snapshot, createDemoRetailerProvider(env)];
  const lists = await Promise.all(
    providers.map((p) => (p ? p.getQuotes(items, { now }) : Promise.resolve([] as Quote[]))),
  );
  return lists.flat();
}

/** Carrinho do próprio usuário com as quatro opções; alheio ou inexistente → null. */
export async function loadCartView(
  client: SupabaseClient,
  cartId: string,
  userId: string,
  env: ServiceEnv,
  now: Date = new Date(),
): Promise<CartView | null> {
  const cart = await getCart(client, cartId);
  if (!cart || cart.ownerId !== userId) return null;
  const items = cart.items.map((i) => ({ itemKey: i.itemKey, name: i.name, quantity: i.quantity }));
  const [quotes, retailers, clicks] = await Promise.all([
    collectQuotes(client, cart, env, now),
    listActiveRetailers(client),
    client.from("affiliate_clicks").select("retailer_id").eq("cart_id", cartId),
  ]);
  if (clicks.error) throw new Error(`ler cliques: ${clicks.error.message}`);
  // Papelaria local: sem provedor nesta fatia (ligado na S11) → indisponível.
  const options = buildCartOptions(items, quotes, null, now);
  const sample = cart.items[0] ?? null;
  const stores: Record<string, StoreInfo> = {};
  for (const r of retailers) stores[r.slug] = storeInfo(r, sample, env);
  const openedIds = new Set((clicks.data ?? []).map((c) => String(c.retailer_id)));
  return {
    cart,
    options,
    stores,
    retailers,
    openedSlugs: retailers.filter((r) => openedIds.has(r.id)).map((r) => r.slug),
  };
}

export function storeName(view: Pick<CartView, "stores">, storeId: string): string {
  if (storeId.startsWith(LOCAL_STORE_PREFIX)) return "Papelaria local";
  return view.stores[storeId]?.name ?? storeId;
}
