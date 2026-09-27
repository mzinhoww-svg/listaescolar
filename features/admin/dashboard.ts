import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

/**
 * Contagens reais do dashboard (Admin01-Visao, S16). Cada categoria lê `schools`/`school_lists`/`claims`/
 * `stationeries`/`leads` pelo client de SESSÃO (RLS `..._select_admin`, S01–S14) com uma consulta `count` por
 * valor do enum — nunca um número inventado. Falha de uma categoria não derruba as outras: ela vira
 * `unavailable`, e a tela mostra "indisponível" só ali.
 */

export type StatusCount = { state: string; count: number };
export type DashboardCategory = { counts: StatusCount[]; unavailable: false } | { counts: []; unavailable: true };

export type DashboardCounts = {
  schools: DashboardCategory;
  lists: DashboardCategory;
  claims: DashboardCategory;
  stationeries: DashboardCategory;
  leads: DashboardCategory;
};

const SCHOOL_STATES = ["registered", "claimed", "verified", "suspended"] as const;
const LIST_STATES = [
  "draft", "submitted", "processing", "processing_async", "review_needed",
  "human_review", "approved", "published", "archived", "rejected",
] as const;
const CLAIM_STATES = ["submitted", "awaiting_verification", "token_expired", "insufficient_evidence", "rejected", "approved"] as const;
const STATIONERY_STATES = ["signup", "accreditation", "under_review", "approved", "active", "paused", "suspended", "rejected"] as const;
const LEAD_STATES = [
  "received", "viewed", "in_progress", "quote_sent", "awaiting_customer", "converted", "declined", "expired", "cancelled",
] as const;

async function countByStatus(client: SupabaseClient, table: string, column: string, states: readonly string[]): Promise<DashboardCategory> {
  try {
    const counts = await Promise.all(
      states.map(async (state) => {
        const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq(column, state);
        if (error) throw error;
        return { state, count: count ?? 0 };
      }),
    );
    return { counts, unavailable: false };
  } catch (error) {
    console.error(`dashboard: contagem de ${table} indisponível`, error instanceof Error ? error.message : "erro");
    return { counts: [], unavailable: true };
  }
}

export async function getDashboardCounts(actor: SessionActor): Promise<DashboardCounts> {
  if (actor.role !== "admin" && actor.role !== "system") throw new Error("forbidden");
  const client = await createClient();
  const [schools, lists, claims, stationeries, leads] = await Promise.all([
    countByStatus(client, "schools", "verification_status", SCHOOL_STATES),
    countByStatus(client, "school_lists", "status", LIST_STATES),
    countByStatus(client, "claims", "status", CLAIM_STATES),
    countByStatus(client, "stationeries", "status", STATIONERY_STATES),
    countByStatus(client, "leads", "status", LEAD_STATES),
  ]);
  return { schools, lists, claims, stationeries, leads };
}
