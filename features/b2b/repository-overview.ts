import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { fail, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
// ---------------------------------------------------------------------------
// Leitura do próprio parceiro (B2B01/B2B02)
// ---------------------------------------------------------------------------

export type PartnerOverview = {
  partnerId: string;
  status: string;
  plan: string | null;
  coverageUfs: readonly string[] | null;
  limits: { testRatePerMinute: number | null; testRatePerDay: number | null; liveRatePerMinute: number | null; liveRatePerDay: number | null };
  callsMonth: number;
  callsToday: number;
  errors4xxToday: number;
  rateLimitedToday: number;
  matchTotal: number;
  matchMatched: number;
  listsAvailableLive: number;
  listsAvailableTest: number;
  callsByDay: readonly { day: string; count: number }[];
  keys: readonly {
    id: string;
    environment: "test" | "live";
    publicId: string;
    last4: string;
    scopes: readonly string[];
    status: "active" | "revoked";
    expiresAt: string | null;
    createdAt: string;
    rotatedFromId: string | null;
    revokedAt: string | null;
    lastUsedOn: string | null;
  }[];
  today: string;
};

const overviewSchema = z
  .object({
    partner_id: z.uuid(),
    status: z.string(),
    plan: z.string().nullable(),
    coverage_ufs: z.array(z.string()).nullable(),
    limits: z.object({
      test_rate_per_minute: z.number().nullable(),
      test_rate_per_day: z.number().nullable(),
      live_rate_per_minute: z.number().nullable(),
      live_rate_per_day: z.number().nullable(),
    }),
    calls_month: z.number(),
    calls_today: z.number(),
    errors_4xx_today: z.number(),
    rate_limited_today: z.number(),
    match_total: z.number(),
    match_matched: z.number(),
    lists_available_live: z.number(),
    lists_available_test: z.number(),
    calls_by_day: z.array(z.object({ day: z.string(), count: z.number() })),
    keys: z.array(
      z.object({
        id: z.uuid(),
        environment: z.enum(["test", "live"]),
        public_id: z.string(),
        last4: z.string(),
        scopes: z.array(z.string()),
        status: z.enum(["active", "revoked"]),
        expires_at: z.string().nullable(),
        created_at: z.string(),
        rotated_from_id: z.uuid().nullable(),
        revoked_at: z.string().nullable(),
        last_used_on: z.string().nullable(),
      }),
    ),
    today: z.string(),
  })
  .transform((r) => ({
    partnerId: r.partner_id,
    status: r.status,
    plan: r.plan,
    coverageUfs: r.coverage_ufs,
    limits: {
      testRatePerMinute: r.limits.test_rate_per_minute,
      testRatePerDay: r.limits.test_rate_per_day,
      liveRatePerMinute: r.limits.live_rate_per_minute,
      liveRatePerDay: r.limits.live_rate_per_day,
    },
    callsMonth: r.calls_month,
    callsToday: r.calls_today,
    errors4xxToday: r.errors_4xx_today,
    rateLimitedToday: r.rate_limited_today,
    matchTotal: r.match_total,
    matchMatched: r.match_matched,
    listsAvailableLive: r.lists_available_live,
    listsAvailableTest: r.lists_available_test,
    callsByDay: r.calls_by_day,
    keys: r.keys.map((k) => ({
      id: k.id,
      environment: k.environment,
      publicId: k.public_id,
      last4: k.last4,
      scopes: k.scopes,
      status: k.status,
      expiresAt: k.expires_at,
      createdAt: k.created_at,
      rotatedFromId: k.rotated_from_id,
      revokedAt: k.revoked_at,
      lastUsedOn: k.last_used_on,
    })),
    today: r.today,
  }));

/** Id do parceiro do qual o ator é dono (`member_role = 'owner'`), ou `null` se não for membro de nenhum. */
export async function myPartnerId(client: SupabaseClient, actor: SessionActor): Promise<string | null> {
  requireActor(actor);
  const { data, error } = await client.from("b2b_partner_members").select("partner_id").eq("profile_id", actor.userId).maybeSingle();
  if (error) fail("ler vínculo com parceiro", error);
  return data ? z.uuid().parse((data as { partner_id: string }).partner_id) : null;
}

export async function overview(client: SupabaseClient, partnerId: string): Promise<PartnerOverview | null> {
  const { data, error } = await client.rpc("b2b_partner_overview", { p_partner_id: partnerId, p_days: 30 });
  if (error) fail("ler visão do parceiro", error);
  if (!data) return null;
  return overviewSchema.parse(data);
}

/** `getMyPartner`: `null` quando o ator não é dono de nenhum parceiro (cadastro nunca feito). */
export async function getMyPartner(client: SupabaseClient, actor: SessionActor): Promise<PartnerOverview | null> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) return null;
  return overview(client, partnerId);
}

// ---------------------------------------------------------------------------
// Dados de cadastro (B2B00 preview em B2B01/B2B02/Conta e Admin15) — Task 3, Ruling: função aditiva nova (nenhuma
// existente mudou). `b2b_partner_overview` só traz agregados (sem nome/CNPJ/contato); a tela precisa dos dois.
// Select direto em `b2b_partners`, sempre por um `partnerId` que quem chama já resolveu por posse ou papel admin.
// ---------------------------------------------------------------------------

export type PartnerHeader = {
  tradeName: string;
  legalName: string;
  cnpj: string;
  contactName: string;
  partnerType: string;
  coverageUfs: readonly string[] | null;
  statusReason: string | null;
  isDemo: boolean;
  createdAt: string;
};

const partnerHeaderSchema = z
  .object({
    trade_name: z.string(),
    legal_name: z.string(),
    cnpj: z.string(),
    contact_name: z.string(),
    partner_type: z.string(),
    coverage_ufs: z.array(z.string()).nullable(),
    status_reason: z.string().nullable(),
    is_demo: z.boolean(),
    created_at: z.string(),
  })
  .transform((r) => ({
    tradeName: r.trade_name,
    legalName: r.legal_name,
    cnpj: r.cnpj,
    contactName: r.contact_name,
    partnerType: r.partner_type,
    coverageUfs: r.coverage_ufs,
    statusReason: r.status_reason,
    isDemo: r.is_demo,
    createdAt: r.created_at,
  }));

export async function partnerHeader(client: SupabaseClient, partnerId: string): Promise<PartnerHeader | null> {
  const { data, error } = await client
    .from("b2b_partners")
    .select("trade_name, legal_name, cnpj, contact_name, partner_type, coverage_ufs, status_reason, is_demo, created_at")
    .eq("id", partnerId)
    .maybeSingle();
  if (error) fail("ler dados do parceiro", error);
  return data ? partnerHeaderSchema.parse(data) : null;
}

export type PartnerEvent = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorRole: string;
  reason: string | null;
  createdAt: string;
};

const partnerEventSchema = z
  .object({
    id: z.uuid(),
    event_type: z.string(),
    from_status: z.string().nullable(),
    to_status: z.string().nullable(),
    actor_role: z.string(),
    reason: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((r) => ({ id: r.id, eventType: r.event_type, fromStatus: r.from_status, toStatus: r.to_status, actorRole: r.actor_role, reason: r.reason, createdAt: r.created_at }));

/** Linha do tempo (Admin15). Nunca `actor_id` (id de perfil) — mesma exclusão do `grant` para `authenticated`,
 * ainda que aqui o cliente seja de serviço. */
export async function listPartnerEvents(client: SupabaseClient, partnerId: string): Promise<PartnerEvent[]> {
  const { data, error } = await client
    .from("b2b_partner_events")
    .select("id, event_type, from_status, to_status, actor_role, reason, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  if (error) fail("ler linha do tempo do parceiro", error);
  return z.array(partnerEventSchema).parse(data ?? []);
}
