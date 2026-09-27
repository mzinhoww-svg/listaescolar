import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "./actor";
import { CatalogItemInputSchema, catalogItemKey, type CatalogItemInput, type CatalogStock } from "./catalog";
import { fail, loadOwned, requireActor, StationeryRepositoryError } from "./repository-shared";
import { STATIONERY_STATUSES } from "./state";

/**
 * Catálogo, extraído de `repository.ts` (D-057, S18): comportamento idêntico ao arquivo original. `fetchCatalog`
 * é reexportado porque `repository-reads.ts` (`getPublicProfile`) também precisa dele (o catálogo público reusa
 * a mesma paginação/teto).
 */

/** Itens por envio (o CSV já limita a 2.000 linhas). Acima disso: erro claro, nunca corte silencioso. */
export const CATALOG_UPSERT_MAX_ITEMS = 2000;

/**
 * Insere ou atualiza itens por (papelaria, item_key) numa só transação (`stationery_upsert_catalog`, que confere
 * posse e estado sob trava). Idempotente: repetir o envio não duplica linhas e `price_updated_at` só renova nos itens
 * cujo preço mudou (o banco decide, por trigger). Nome repetido no lote: vale o último.
 */
export async function upsertCatalogItems(
  client: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  items: readonly CatalogItemInput[],
): Promise<{ upserted: number }> {
  requireActor(actor);
  const byKey = new Map<string, { name: string; item_key: string; price_cents: number; stock_status: CatalogStock }>();
  for (const raw of items) {
    const parsed = CatalogItemInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StationeryRepositoryError(`item inválido: ${parsed.error.issues[0]?.message ?? ""}`, "invalid_input");
    }
    const key = catalogItemKey(parsed.data.name);
    byKey.set(key, { name: parsed.data.name, item_key: key, price_cents: parsed.data.priceCents, stock_status: parsed.data.stock });
  }
  if (byKey.size > CATALOG_UPSERT_MAX_ITEMS) {
    throw new StationeryRepositoryError(`no máximo ${CATALOG_UPSERT_MAX_ITEMS} itens por envio`, "limit_exceeded");
  }
  const { data, error } = await client.rpc("stationery_upsert_catalog", {
    p_id: stationeryId,
    p_actor_id: actor.userId,
    p_items: [...byKey.values()],
  });
  if (error) fail("gravar catálogo", error);
  return { upserted: z.number().int().parse(data) };
}

export type CatalogRow = {
  id: string;
  name: string;
  itemKey: string;
  priceCents: number;
  priceSource: string;
  stock: CatalogStock;
  isActive: boolean;
  /** Data do preço informado (`catalog_items.price_updated_at`): muda só quando o preço muda. */
  priceUpdatedAt: Date;
};

const catalogRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  item_key: z.string(),
  price_cents: z.number().int(),
  price_source: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  is_active: z.boolean(),
  price_updated_at: z.string(),
});
const mapCatalog = (r: z.output<typeof catalogRowSchema>): CatalogRow => ({
  id: r.id,
  name: r.name,
  itemKey: r.item_key,
  priceCents: r.price_cents,
  priceSource: r.price_source,
  stock: r.stock_status,
  isActive: r.is_active,
  priceUpdatedAt: new Date(r.price_updated_at),
});
const CATALOG_COLUMNS = "id, name, item_key, price_cents, price_source, stock_status, is_active, price_updated_at";

const CATALOG_PAGE_SIZE = 1000; // igual ao teto de linhas do PostgREST (max_rows)
/** Itens lidos por papelaria. Acima disso: erro claro (`limit_exceeded`), nunca lista cortada em silêncio. */
export const CATALOG_MAX_ITEMS = 5000;

/** Todas as páginas do catálogo (ordem estável); passou do teto, falha. */
export async function fetchCatalog(client: SupabaseClient, stationeryId: string, activeOnly: boolean): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  for (let from = 0; ; from += CATALOG_PAGE_SIZE) {
    let q = client.from("catalog_items").select(CATALOG_COLUMNS).eq("stationery_id", stationeryId);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order("name").order("id").range(from, from + CATALOG_PAGE_SIZE - 1);
    if (error) fail("listar catálogo", error);
    const page = data ?? [];
    for (const r of page) rows.push(mapCatalog(catalogRowSchema.parse(r)));
    if (rows.length > CATALOG_MAX_ITEMS) {
      throw new StationeryRepositoryError(`catálogo com mais de ${CATALOG_MAX_ITEMS} itens`, "limit_exceeded");
    }
    if (page.length < CATALOG_PAGE_SIZE) return rows;
  }
}

/** Catálogo da papelaria (todos os itens, para o dono). */
export async function listCatalogItems(client: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<CatalogRow[]> {
  requireActor(actor);
  await loadOwned(client, stationeryId, actor.userId, STATIONERY_STATUSES);
  return fetchCatalog(client, stationeryId, false);
}
