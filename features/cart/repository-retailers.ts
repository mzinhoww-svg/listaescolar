import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "./repository-shared";
import { retailerRowSchema, type RetailerRow } from "./schemas";

/** Varejistas, extraído de `repository.ts` (D-057, S18) — comportamento idêntico ao original. */

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
