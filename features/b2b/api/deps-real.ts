import "server-only";

import { randomUUID } from "node:crypto";

import { after as nextAfter } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { API_DB_TIMEOUT_MS } from "../limits";
import type { ApiHandlerDeps } from "./handler-types";
import { recordUsage as recordUsageRpc } from "./usage";

/**
 * D-158 (S19): extraído de handler.ts (549 linhas) — sem mudança de comportamento, só posição. Implementação
 * REAL de `ApiHandlerDeps` (RPCs do Supabase, `after()` do Next, relógio/`requestId` reais); `handler.ts` chama
 * `buildRealDeps()` dentro de `withApiKey`.
 */

/** Lookup real (`b2b_key_lookup`), exportado para os testes de banco montarem um `overrideDeps.lookupKey` que
 * envolve esta MESMA chamada com um efeito colateral no meio (ex.: revogar a chave entre o lookup e o consumo). */
export function realLookupKey(admin: SupabaseClient): ApiHandlerDeps["lookupKey"] {
  return async (publicId, signal) => {
    // Achado 3: `.abortSignal()` (supabase-js) encaminha o `AbortSignal` até o `fetch` do PostgREST — quando o
    // timeout do pipeline aborta, a consulta é cancelada de verdade no servidor, não só ignorada aqui.
    let query = admin.rpc("b2b_key_lookup", { p_public_id: publicId });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      keyId: row.key_id,
      partnerId: row.partner_id,
      environment: row.environment,
      keyHash: row.key_hash,
      hashVersion: row.hash_version,
      scopes: row.scopes ?? [],
      usable: row.usable,
      coverageUfs: row.coverage_ufs ?? null,
    };
  };
}

export function realConsumeRate(admin: SupabaseClient): ApiHandlerDeps["consumeRate"] {
  return async (keyId, signal) => {
    let query = admin.rpc("b2b_rate_consume", { p_key_id: keyId });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      keyValid: Boolean(row?.key_valid),
      windowKind: row?.window_kind ?? null,
      limitValue: row?.limit_value ?? null,
      remaining: row?.remaining ?? null,
      resetAt: row?.reset_at ? new Date(row.reset_at) : null,
    };
  };
}

export function realRecordUsage(admin: SupabaseClient): ApiHandlerDeps["recordUsage"] {
  return (info) => recordUsageRpc(admin, info);
}

function realPepper(): string | undefined {
  try {
    return getServerEnv().B2B_API_KEY_PEPPER;
  } catch (error) {
    // `getServerEnv()` valida TODO `serverSchema` (não só o pepper); sem log, um 503 aqui não dá pista nenhuma de
    // qual variável falhou (revisão final do branch S24). Só o nome do erro — nunca a mensagem/stack, que podem
    // ecoar o valor inválido.
    console.error("b2b pepper/env", error instanceof Error ? error.name : "erro");
    return undefined;
  }
}

/** Pode lançar de forma síncrona (`createAdminClient()` valida `SUPABASE_SECRET_KEY` na hora) — quem chama
 * (`withApiKey`) precisa envolver isto em `try/catch` para nunca deixar a exceção escapar do Route Handler sem o
 * envelope padrão. */
export function buildRealDeps(): ApiHandlerDeps {
  const admin = createAdminClient();
  return {
    pepper: realPepper,
    lookupKey: realLookupKey(admin),
    consumeRate: realConsumeRate(admin),
    recordUsage: realRecordUsage(admin),
    after: (cb) => nextAfter(cb),
    now: () => new Date(),
    requestId: () => randomUUID(),
    timeoutMs: API_DB_TIMEOUT_MS,
  };
}
