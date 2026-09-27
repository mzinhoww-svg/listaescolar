import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PrivacyError } from "./errors";

/** Recursos cobertos por D-012 (S17). Espelha o CHECK de `retention_policies.resource` da migration 0605. */
const RESOURCES = ["claim_evidence", "claim_tokens"] as const;
export type RetentionResource = (typeof RESOURCES)[number];

export type RetentionOutcome = { resource: RetentionResource; purged: number; storageFailed: number };

const candidateSchema = z.object({ id: z.uuid(), storage_path: z.string().nullable() });

function fail(action: string, error: { message: string }): never {
  throw new PrivacyError(`${action}: ${error.message}`, "database");
}

/**
 * Job de retenção (D-012): apaga evidências de reivindicação e tokens vencidos, um recurso por vez, com teto por
 * execução (`limit`, também limitado dentro de `retention_candidates`). Idempotente: candidato já apagado não
 * conta de novo, sem erro. Remove o objeto do Storage ANTES de apagar a linha (best-effort: falha no Storage não
 * impede o `retention_purge` — mesmo padrão de D-017 — e é reportada em `storageFailed`, nunca lançada). Nunca
 * toca `survey_*` (ADR-005): só conhece os dois recursos fixos de `RESOURCES`.
 */
export async function runRetention(admin: SupabaseClient, limit = 200): Promise<RetentionOutcome[]> {
  const outcomes: RetentionOutcome[] = [];
  for (const resource of RESOURCES) {
    const { data, error } = await admin.rpc("retention_candidates", { p_resource: resource, p_limit: limit });
    if (error) fail("buscar candidatos de retenção", error);
    const rows = z.array(candidateSchema).parse(data ?? []);

    let storageFailed = 0;
    if (resource === "claim_evidence") {
      const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p));
      if (paths.length > 0) {
        const { error: rmError } = await admin.storage.from("claim-evidence").remove(paths);
        if (rmError) {
          storageFailed = paths.length;
          console.error("retenção: falha ao remover do storage", rmError.name ?? "erro");
        }
      }
    }

    let purged = 0;
    if (rows.length > 0) {
      const { data: purgedRaw, error: purgeError } = await admin.rpc("retention_purge", {
        p_resource: resource,
        p_ids: rows.map((r) => r.id),
      });
      if (purgeError) fail("apagar candidatos de retenção", purgeError);
      purged = z.number().int().nonnegative().parse(purgedRaw);
    }
    outcomes.push({ resource, purged, storageFailed });
  }
  return outcomes;
}
