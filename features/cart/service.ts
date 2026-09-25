import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildRetailerRedirect, type AffiliateEnv } from "./affiliate";
import { createDemoRetailerProvider, isDemoEnabled, type DemoEnv } from "./demo-provider";
import { composeLeadContextReader, composeListReader } from "@/features/integration/compose";
import { createLocalCatalogSource } from "@/features/stationeries/repository";
import { CatalogLocalQuoteProvider } from "@/features/stationeries/local-quote-provider";
import { createAdminClient } from "@/lib/supabase/admin";

import { buildCartOptions } from "./options-engine";
import {
  getCart,
  getPriceSnapshots,
  listActiveRetailers,
  saveCartChoice,
  saveOptionsSnapshot,
  type CartItemRow,
  type CartRow,
} from "./repository";
import type { RetailerRow } from "./schemas";
import { SnapshotRetailerProvider } from "./snapshot-provider";
import { RedirectTargetError } from "./redirect-target";
import type { CartOption, CartStrategy, LocalQuote, Quote } from "./types";
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

/** Leitor de listas (S11): banco real (oficial e cópia do próprio pai) e, atrás da regra fail-closed da S12, a demonstração. */
export function getListReader(env: ServiceEnv): ListReader {
  return composeListReader(createAdminClient(), env);
}

/**
 * Cotação da papelaria local (S13, ligada na S11 · D-045): só com o município da escola da lista (lista oficial ou cópia do pai com
 * escola). Sem município conhecido (demonstração, cópia sem escola) devolve `null` = "cotação local indisponível"; nada de chute.
 */
export async function collectLocalQuotes(cart: CartRow, env: ServiceEnv, now: Date): Promise<LocalQuote[] | null> {
  if (cart.listId === null) return null;
  try {
    const admin = createAdminClient();
    const context = await composeLeadContextReader(admin, env).getContext(cart.listId, { actorId: cart.ownerId });
    if (!context?.municipalityId) return null;
    const items = cart.items.map((i) => ({ itemKey: i.itemKey, name: i.name, quantity: i.quantity }));
    return await new CatalogLocalQuoteProvider(createLocalCatalogSource(admin), { municipalityId: context.municipalityId }).getQuotes(items, { now });
  } catch {
    // Falha da fonte local (rede, limite) degrada para "cotação local indisponível": nunca inventa preço, nunca derruba o carrinho.
    console.error(JSON.stringify({ level: "error", fn: "cart.local_quotes", code: "local_quotes_unavailable" }));
    return null;
  }
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
  const [quotes, local, retailers, clicks] = await Promise.all([
    collectQuotes(client, cart, env, now),
    collectLocalQuotes(cart, env, now),
    listActiveRetailers(client),
    client.from("affiliate_clicks").select("retailer_id").eq("cart_id", cartId),
  ]);
  if (clicks.error) throw new Error(`ler cliques: ${clicks.error.message}`);
  // Papelaria local (S13, ligada na S11): sem município da escola → `null` = indisponível.
  const options = buildCartOptions(items, quotes, local, now);
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

/** Recalcula as opções do carrinho do usuário e grava o retrato em `options_snapshot`. */
export async function snapshotCartOptions(
  client: SupabaseClient,
  cartId: string,
  userId: string,
  env: ServiceEnv,
  now: Date = new Date(),
): Promise<CartView | null> {
  const view = await loadCartView(client, cartId, userId, env, now);
  if (!view) return null;
  await saveOptionsSnapshot(client, cartId, view.options);
  return view;
}

export type ChoiceResult = "ok" | "not_found" | "unavailable";

/** "Escolher esta": só opção com preço de fonte; grava `strategy` e o retrato das opções mostradas. */
export async function chooseCartStrategy(
  client: SupabaseClient,
  cartId: string,
  userId: string,
  strategy: CartStrategy,
  env: ServiceEnv,
  now: Date = new Date(),
): Promise<ChoiceResult> {
  const view = await loadCartView(client, cartId, userId, env, now);
  if (!view) return "not_found";
  const option = view.options.find((o) => o.strategy === strategy);
  if (!option || option.status === "unavailable" || option.totalCents === null) {
    return "unavailable";
  }
  await saveCartChoice(client, cartId, strategy, view.options);
  return "ok";
}
