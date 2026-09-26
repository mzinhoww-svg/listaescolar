import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { b2bDbErrorCode, B2bServiceError, type B2bServiceErrorCode } from "./errors";
import type { B2bScope } from "./scopes";
import { KEY_ROTATION_GRACE_DAYS } from "./limits";

// Repositório server-only do portal B2B (dono e admin). Recebe o cliente de SERVIÇO e um `SessionActor`; posse e
// papel são conferidos aqui E de novo, dentro da mesma transação, pelas funções SQL (0501) — defesa em profundidade.
// Mesmo padrão de `features/stationeries/repository.ts`.

/** O ator precisa ter sido criado por `getSessionActor` (o tipo de marca não cobre `as`). */
function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new B2bServiceError("ator não vem da sessão", "forbidden");
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: B2bServiceErrorCode): never {
  throw new B2bServiceError(`${what}: ${error.message}`, code ?? b2bDbErrorCode(error), error.code);
}

/** `forbidden` de uma operação sobre uma chave/parceiro alheio vira `not_found`: nunca revela que existe. */
function failMasked(what: string, error: { message: string; code?: string; hint?: string | null }): never {
  const code = b2bDbErrorCode(error);
  fail(what, error, code === "forbidden" ? "not_found" : code);
}

// ---------------------------------------------------------------------------
// Cadastro (B2B00)
// ---------------------------------------------------------------------------

export type ApplyPartnerPayload = {
  tradeName: string;
  legalName: string;
  cnpj: string; // já validado (DV) e normalizado (14 posições [0-9A-Z]) pelo serviço
  contactName: string;
  partnerType: "retailer" | "brand" | "edtech";
  coverageUfs: readonly string[] | null;
};

export async function applyPartner(client: SupabaseClient, actor: SessionActor, payload: ApplyPartnerPayload, termsVersion: string): Promise<{ partnerId: string }> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_partner_apply", {
    p_actor_id: actor.userId,
    p_payload: {
      trade_name: payload.tradeName,
      legal_name: payload.legalName,
      cnpj: payload.cnpj,
      contact_name: payload.contactName,
      partner_type: payload.partnerType,
      coverage_ufs: payload.coverageUfs,
    },
    p_terms_version: termsVersion,
  });
  if (error) fail("cadastrar parceiro", error);
  return { partnerId: z.uuid().parse(data) };
}

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
// Chaves (B2B02)
// ---------------------------------------------------------------------------

export type CreatedKeyRecord = { keyId: string };

/** Ambiente da chave (para o serviço rotular a chave nova rotacionada com o mesmo ambiente da antiga). Não
 * verifica posse: quem decide se a rotação vale é `b2b_key_rotate`, dentro da mesma transação. `null` = não existe. */
export async function getKeyEnvironment(client: SupabaseClient, keyId: string): Promise<"test" | "live" | null> {
  const { data, error } = await client.from("b2b_api_keys").select("environment").eq("id", keyId).maybeSingle();
  if (error) fail("ler ambiente da chave", error);
  return data ? z.enum(["test", "live"]).parse((data as { environment: string }).environment) : null;
}

export async function createKey(
  client: SupabaseClient,
  actor: SessionActor,
  partnerId: string,
  input: { environment: "test" | "live"; publicId: string; keyHash: string; hashVersion: number; last4: string; scopes: readonly B2bScope[] },
): Promise<CreatedKeyRecord> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_key_create", {
    p_actor_id: actor.userId,
    p_partner_id: partnerId,
    p_environment: input.environment,
    p_public_id: input.publicId,
    p_key_hash: input.keyHash,
    p_hash_version: input.hashVersion,
    p_last4: input.last4,
    p_scopes: input.scopes,
  });
  if (error) failMasked("criar chave", error);
  return { keyId: z.uuid().parse(data) };
}

export async function rotateKey(
  client: SupabaseClient,
  actor: SessionActor,
  input: { oldKeyId: string; publicId: string; keyHash: string; hashVersion: number; last4: string; graceDays?: number },
): Promise<CreatedKeyRecord> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_key_rotate", {
    p_actor_id: actor.userId,
    p_old_key_id: input.oldKeyId,
    p_public_id: input.publicId,
    p_key_hash: input.keyHash,
    p_hash_version: input.hashVersion,
    p_last4: input.last4,
    p_grace: `${input.graceDays ?? KEY_ROTATION_GRACE_DAYS.default} days`,
  });
  if (error) failMasked("rotacionar chave", error);
  return { keyId: z.uuid().parse(data) };
}

export async function revokeKey(client: SupabaseClient, actor: SessionActor, keyId: string, reason?: string): Promise<void> {
  requireActor(actor);
  const { error } = await client.rpc("b2b_key_revoke", { p_actor_id: actor.userId, p_actor_role: "owner", p_key_id: keyId, p_reason: reason ?? null });
  if (error) failMasked("revogar chave", error);
}

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
