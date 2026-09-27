import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { LocalCatalogCandidate, LocalCatalogSource, LocalLocation } from "./ports";
import { fail } from "./repository-shared";

/**
 * D-057 (S18): este arquivo tinha 630 linhas (cadastro, posse/estado, catálogo, transição, leitura e a fonte da
 * cotação local). Dividido em arquivos-irmãos por responsabilidade: `repository-shared.ts` (erro/schema comuns),
 * `repository-profile.ts` (cadastro, posse/estado, transição), `repository-catalog.ts` (catálogo),
 * `repository-reads.ts` (perfil público e visão do admin). Este arquivo continua sendo o ÚNICO ponto de import
 * (`@/features/stationeries/repository`) — reexporta tudo dos irmãos e mantém só `createLocalCatalogSource`
 * (a fonte da cotação local), que não coube em nenhum dos três grupos.
 */
export { StationeryRepositoryError, slugify, type StationeryErrorCode } from "./repository-shared";
export * from "./repository-profile";
export * from "./repository-catalog";
export * from "./repository-reads";

// ---------------------------------------------------------------------------
// Fonte da cotação local
// ---------------------------------------------------------------------------

const candidateSchema = z.object({
  stationery_id: z.uuid(),
  item_key: z.string(),
  price_cents: z.number().int(),
  price_source: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  is_active: z.boolean(),
  price_updated_at: z.string(),
  status: z.string(),
  municipality_id: z.uuid(),
  stationery_neighborhood: z.string().nullable(),
  is_demo: z.boolean(),
  areas: z.array(z.object({ municipality_id: z.uuid(), neighborhood: z.string() })),
});

/** Teto de candidatos por consulta. Passou disso, `findCandidates` FALHA (`limit_exceeded`): nunca devolve lista parcial. */
export const CANDIDATE_LIMIT = 5000;

/**
 * Implementa `LocalCatalogSource` sobre a função SQL `stationery_local_candidates` (só service_role): o filtro
 * (papelaria `active`, município ou área, item ativo, estoque não zerado, chaves pedidas) roda no banco; a função
 * devolve um único jsonb (sem o corte de 1000 linhas do PostgREST) e falha se houver mais que o limite.
 * O refinamento por bairro fica em `servesLocation` (uma só normalização).
 */
export function createLocalCatalogSource(client: SupabaseClient, options: { limit?: number } = {}): LocalCatalogSource {
  const limit = options.limit ?? CANDIDATE_LIMIT;
  return {
    async findCandidates(query: { itemKeys: readonly string[]; location: LocalLocation }, opts) {
      if (query.itemKeys.length === 0) return [];
      const call = client.rpc("stationery_local_candidates", {
        p_municipality_id: query.location.municipalityId,
        p_item_keys: [...query.itemKeys],
        p_limit: limit,
      });
      const { data, error } = await (opts?.signal ? call.abortSignal(opts.signal) : call);
      if (error) fail("buscar catálogo local", error);
      return z.array(candidateSchema).parse(data ?? []).map(
        (r): LocalCatalogCandidate => ({
          stationeryId: r.stationery_id,
          status: r.status,
          municipalityId: r.municipality_id,
          neighborhood: r.stationery_neighborhood,
          isDemo: r.is_demo,
          areas: r.areas.map((a) => ({ municipalityId: a.municipality_id, neighborhood: a.neighborhood })),
          itemKey: r.item_key,
          priceCents: r.price_cents,
          priceSource: r.price_source,
          stock: r.stock_status,
          itemActive: r.is_active,
          priceUpdatedAt: new Date(r.price_updated_at),
        }),
      );
    },
  };
}
