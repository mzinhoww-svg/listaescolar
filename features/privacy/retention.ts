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
 * Remove `paths` do bucket e devolve só os confirmados removidos (Revisão de segurança: "só purga as linhas cujo
 * arquivo foi removido com sucesso"). `.remove()` do Storage não erra para caminho já inexistente — só devolve,
 * em `data`, os que existiam e foram removidos agora. Para os que sobram (não confirmados no `data`, nem porque a
 * chamada falhou), verificamos por `list()` se já não existem (execução anterior que apagou o arquivo mas não
 * chegou a `retention_purge`, ou reentrada): confirmados ausentes entram no conjunto "removido" também, para não
 * travar o expurgo para sempre por um estado que já está correto.
 */
async function removeConfirmed(admin: SupabaseClient, bucket: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const { data, error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    console.error("retenção: falha ao remover do storage", error.name ?? error.message);
    return new Set();
  }
  const removed = new Set((data ?? []).map((f) => f.name));
  const ambiguous = paths.filter((p) => !removed.has(p));
  for (const path of ambiguous) {
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    const base = slash >= 0 ? path.slice(slash + 1) : path;
    const { data: listing, error: listError } = await admin.storage.from(bucket).list(folder, { search: base });
    if (!listError && !(listing ?? []).some((f) => f.name === base)) {
      removed.add(path); // confirmado ausente: já não existe, seguro purgar a linha
    }
  }
  return removed;
}

/**
 * Job de retenção (D-012): apaga evidências de reivindicação e tokens vencidos, um recurso por vez, com teto por
 * execução (`limit`, também limitado dentro de `retention_candidates`). Idempotente: candidato já apagado não
 * conta de novo, sem erro. Para `claim_evidence`, só apaga a LINHA do banco depois de confirmar que o arquivo já
 * não existe no Storage (removido agora ou já ausente) — uma falha real de Storage NUNCA leva ao `retention_purge`
 * daquele id (fica candidato de novo na próxima execução; conta em `storageFailed`, nunca lança). Nunca toca
 * `survey_*` (ADR-005): só conhece os dois recursos fixos de `RESOURCES`.
 */
export async function runRetention(admin: SupabaseClient, limit = 200): Promise<RetentionOutcome[]> {
  const outcomes: RetentionOutcome[] = [];
  for (const resource of RESOURCES) {
    const { data, error } = await admin.rpc("retention_candidates", { p_resource: resource, p_limit: limit });
    if (error) fail("buscar candidatos de retenção", error);
    const rows = z.array(candidateSchema).parse(data ?? []);

    let idsToPurge: string[];
    let storageFailed = 0;
    if (resource === "claim_evidence") {
      const withPath = rows.filter((r): r is { id: string; storage_path: string } => Boolean(r.storage_path));
      const removed = await removeConfirmed(admin, "claim-evidence", withPath.map((r) => r.storage_path));
      idsToPurge = withPath.filter((r) => removed.has(r.storage_path)).map((r) => r.id);
      storageFailed = withPath.length - idsToPurge.length;
    } else {
      idsToPurge = rows.map((r) => r.id); // claim_tokens: sem arquivo no Storage
    }

    let purged = 0;
    if (idsToPurge.length > 0) {
      const { data: purgedRaw, error: purgeError } = await admin.rpc("retention_purge", {
        p_resource: resource,
        p_ids: idsToPurge,
      });
      if (purgeError) fail("apagar candidatos de retenção", purgeError);
      purged = z.number().int().nonnegative().parse(purgedRaw);
    }
    outcomes.push({ resource, purged, storageFailed });
  }
  return outcomes;
}
