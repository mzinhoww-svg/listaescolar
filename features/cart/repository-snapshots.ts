import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fail } from "./repository-shared";
import { snapshotRowSchema, type SnapshotRow } from "./schemas";
import type { CartOption, CartStrategy } from "./types";

/**
 * Snapshots de preço e registro de clique/escolha, extraídos de `repository.ts` (D-057, S18) — comportamento
 * idêntico ao original.
 */

/** Validade padrão de um preço (igual à do motor): 24 h. */
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Linhas mais recentes lidas por item (poucas lojas por item; evita um limite global que cortaria itens). */
export const SNAPSHOTS_PER_ITEM_LIMIT = 50;

export type SnapshotQueryOptions = { now?: Date; maxAgeMs?: number; perItemLimit?: number };

/**
 * Snapshots dos itens (lojas ativas) dentro da validade (`checked_at >= now - validade`), no máximo
 * `perItemLimit` linhas mais recentes por item. O motor ainda aplica frescor e validade.
 */
export async function getPriceSnapshots(
  client: SupabaseClient,
  itemKeys: string[],
  options: SnapshotQueryOptions = {},
): Promise<SnapshotRow[]> {
  const keys = [...new Set(itemKeys)];
  if (keys.length === 0) return [];
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.maxAgeMs ?? SNAPSHOT_MAX_AGE_MS)).toISOString();
  const limit = options.perItemLimit ?? SNAPSHOTS_PER_ITEM_LIMIT;
  const results = await Promise.all(
    keys.map((key) =>
      client
        .from("price_snapshots")
        .select(
          "item_key, price_cents, source, checked_at, product_url, is_demo, retailers!inner(slug, is_active)",
        )
        .eq("item_key", key)
        .eq("retailers.is_active", true)
        .gte("checked_at", since)
        .order("checked_at", { ascending: false })
        .limit(limit),
    ),
  );
  const rows: SnapshotRow[] = [];
  for (const { data, error } of results) {
    if (error) fail("ler preços", error);
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

/** Escolha do usuário: estratégia e o retrato das opções mostradas, na mesma atualização (RLS: só o dono). */
export async function saveCartChoice(
  client: SupabaseClient,
  cartId: string,
  strategy: CartStrategy,
  options: CartOption[],
): Promise<void> {
  const { error } = await client
    .from("carts")
    .update({ strategy, options_snapshot: JSON.parse(JSON.stringify(options)) })
    .eq("id", cartId);
  if (error) fail("salvar escolha", error);
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
