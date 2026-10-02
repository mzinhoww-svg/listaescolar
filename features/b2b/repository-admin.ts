import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { B2bServiceError } from "./errors";
import { overview, type PartnerOverview } from "./repository-overview";
import { fail, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
// ---------------------------------------------------------------------------
// Admin (Admin15)
// ---------------------------------------------------------------------------

const adminRowSchema = z.object({
  id: z.uuid(),
  trade_name: z.string(),
  partner_type: z.string(),
  plan: z.string().nullable(),
  status: z.string(),
});
export type AdminPartnerRow = { id: string; tradeName: string; partnerType: string; plan: string | null; status: string };

export async function listPartners(client: SupabaseClient, actor: SessionActor, filter?: { status?: string; partnerType?: string }): Promise<AdminPartnerRow[]> {
  requireActor(actor);
  if (actor.role !== "admin") throw new B2bServiceError("só admin lista parceiros", "forbidden");
  let query = client.from("b2b_partners").select("id, trade_name, partner_type, plan, status").order("created_at", { ascending: false });
  if (filter?.status) query = query.eq("status", filter.status);
  if (filter?.partnerType) query = query.eq("partner_type", filter.partnerType);
  const { data, error } = await query;
  if (error) fail("listar parceiros", error);
  return z.array(adminRowSchema).parse(data ?? []).map((r) => ({ id: r.id, tradeName: r.trade_name, partnerType: r.partner_type, plan: r.plan, status: r.status }));
}

export async function getPartner(client: SupabaseClient, actor: SessionActor, partnerId: string): Promise<PartnerOverview | null> {
  requireActor(actor);
  if (actor.role !== "admin") throw new B2bServiceError("só admin lê este parceiro", "forbidden");
  return overview(client, partnerId);
}

export async function decide(
  client: SupabaseClient,
  actor: SessionActor,
  partnerId: string,
  input: {
    to: string;
    plan?: string;
    coverageUfs?: readonly string[] | null;
    testRatePerMinute?: number;
    testRatePerDay?: number;
    liveRatePerMinute?: number;
    liveRatePerDay?: number;
    reason?: string;
  },
): Promise<string> {
  requireActor(actor);
  if (actor.role !== "admin") throw new B2bServiceError("só admin decide", "forbidden");
  const payload: Record<string, unknown> = {};
  if (input.plan !== undefined) payload.plan = input.plan;
  if (input.coverageUfs !== undefined) payload.coverage_ufs = input.coverageUfs;
  if (input.testRatePerMinute !== undefined) payload.test_rate_per_minute = input.testRatePerMinute;
  if (input.testRatePerDay !== undefined) payload.test_rate_per_day = input.testRatePerDay;
  if (input.liveRatePerMinute !== undefined) payload.live_rate_per_minute = input.liveRatePerMinute;
  if (input.liveRatePerDay !== undefined) payload.live_rate_per_day = input.liveRatePerDay;
  if (input.reason !== undefined) payload.reason = input.reason;
  const { data, error } = await client.rpc("b2b_partner_decide", { p_partner_id: partnerId, p_actor_id: actor.userId, p_to: input.to, p_payload: payload });
  if (error) fail("decidir parceiro", error);
  return z.string().parse(data);
}

export async function adminRevokeKey(client: SupabaseClient, actor: SessionActor, keyId: string, reason?: string): Promise<void> {
  requireActor(actor);
  if (actor.role !== "admin") throw new B2bServiceError("só admin revoga", "forbidden");
  const { error } = await client.rpc("b2b_key_revoke", { p_actor_id: actor.userId, p_actor_role: "admin", p_key_id: keyId, p_reason: reason ?? null });
  if (error) fail("revogar chave (admin)", error);
}
