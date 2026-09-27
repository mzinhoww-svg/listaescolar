import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import { myPartnerId } from "@/features/b2b/repository";

import { WebhookServiceError, webhookDbErrorCode, type WebhookServiceErrorCode } from "./errors";
import { WEBHOOK_EVENTS } from "./events";

// Repositório server-only do portal de webhooks (S25), mesmo padrão de `features/b2b/repository.ts`: cliente de
// SERVIÇO, filtro explícito por `partnerId` resolvido da posse do ator, e as funções SQL (0502) conferem posse de
// novo, por dentro da mesma transação.

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new WebhookServiceError("ator não vem da sessão", "forbidden");
}

function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: WebhookServiceErrorCode): never {
  throw new WebhookServiceError(`${what}: ${error.message}`, code ?? webhookDbErrorCode(error), error.code);
}

export type EndpointRow = { id: string; partnerId: string; url: string; events: readonly string[]; status: string; createdAt: string; updatedAt: string };
const endpointRowSchema = z
  .object({ id: z.uuid(), partner_id: z.uuid(), url: z.string(), events: z.array(z.string()), status: z.string(), created_at: z.string(), updated_at: z.string() })
  .transform((r) => ({ id: r.id, partnerId: r.partner_id, url: r.url, events: r.events, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at }));

export async function listMyEndpoints(client: SupabaseClient, actor: SessionActor): Promise<EndpointRow[]> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) return [];
  const { data, error } = await client.from("b2b_webhook_endpoints").select("id, partner_id, url, events, status, created_at, updated_at").eq("partner_id", partnerId).order("created_at");
  if (error) fail("listar endpoints", error);
  return z.array(endpointRowSchema).parse(data ?? []);
}

export async function createEndpoint(
  client: SupabaseClient,
  actor: SessionActor,
  input: { url: string; events: readonly string[]; ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number },
): Promise<{ endpointId: string }> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) throw new WebhookServiceError("parceiro não encontrado", "not_found");
  const { data, error } = await client.rpc("b2b_webhook_endpoint_create", {
    p_actor_id: actor.userId,
    p_partner_id: partnerId,
    p_url: input.url,
    p_events: input.events,
    p_secret_ciphertext: input.ciphertext.toString("hex") ? `\\x${input.ciphertext.toString("hex")}` : null,
    p_secret_iv: `\\x${input.iv.toString("hex")}`,
    p_secret_tag: `\\x${input.tag.toString("hex")}`,
    p_key_version: input.keyVersion,
  });
  if (error) fail("criar endpoint", error);
  return { endpointId: z.uuid().parse(data) };
}

export async function updateEndpoint(client: SupabaseClient, actor: SessionActor, endpointId: string, input: { url: string; events: readonly string[] }): Promise<void> {
  requireActor(actor);
  const { error } = await client.rpc("b2b_webhook_endpoint_update", { p_actor_id: actor.userId, p_endpoint_id: endpointId, p_url: input.url, p_events: input.events });
  if (error) fail("atualizar endpoint", error, webhookDbErrorCode(error) === "forbidden" ? "not_found" : undefined);
}

export async function rotateSecret(client: SupabaseClient, actor: SessionActor, endpointId: string, secret: { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number }): Promise<void> {
  requireActor(actor);
  const { error } = await client.rpc("b2b_webhook_secret_rotate", {
    p_actor_id: actor.userId,
    p_endpoint_id: endpointId,
    p_secret_ciphertext: `\\x${secret.ciphertext.toString("hex")}`,
    p_secret_iv: `\\x${secret.iv.toString("hex")}`,
    p_secret_tag: `\\x${secret.tag.toString("hex")}`,
    p_key_version: secret.keyVersion,
  });
  if (error) fail("rotacionar segredo", error, webhookDbErrorCode(error) === "forbidden" ? "not_found" : undefined);
}

export type EncryptedSecretRow = { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number };

/** `bytea` volta do PostgREST como string hex `\x...`. */
function byteaToBuffer(v: string): Buffer {
  return Buffer.from(v.startsWith("\\x") ? v.slice(2) : v, "hex");
}

export async function revealSecret(client: SupabaseClient, actor: SessionActor, endpointId: string): Promise<EncryptedSecretRow> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_webhook_secret_reveal", { p_actor_id: actor.userId, p_endpoint_id: endpointId });
  if (error) fail("revelar segredo", error, webhookDbErrorCode(error) === "forbidden" ? "not_found" : undefined);
  const row = z.array(z.object({ secret_ciphertext: z.string(), secret_iv: z.string(), secret_tag: z.string(), secret_key_version: z.number() })).min(1).parse(data)[0]!;
  return { ciphertext: byteaToBuffer(row.secret_ciphertext), iv: byteaToBuffer(row.secret_iv), tag: byteaToBuffer(row.secret_tag), keyVersion: row.secret_key_version };
}

export type DeliveryRow = {
  id: string;
  endpointId: string;
  eventType: string;
  eventId: string;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  lastErrorCode: string | null;
  lastResponseStatus: number | null;
  sentAt: string | null;
  createdAt: string;
};
const deliveryRowSchema = z
  .object({
    id: z.uuid(), endpoint_id: z.uuid(), event_type: z.enum(WEBHOOK_EVENTS), event_id: z.string(), status: z.string(), attempts: z.number(),
    next_attempt_at: z.string(), last_error_code: z.string().nullable(), last_response_status: z.number().nullable(), sent_at: z.string().nullable(), created_at: z.string(),
  })
  .transform((r) => ({
    id: r.id, endpointId: r.endpoint_id, eventType: r.event_type, eventId: r.event_id, status: r.status, attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at, lastErrorCode: r.last_error_code, lastResponseStatus: r.last_response_status, sentAt: r.sent_at, createdAt: r.created_at,
  }));

export async function listMyDeliveries(client: SupabaseClient, actor: SessionActor, limit = 50): Promise<DeliveryRow[]> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) return [];
  const { data, error } = await client
    .from("b2b_webhook_deliveries")
    .select("id, endpoint_id, event_type, event_id, status, attempts, next_attempt_at, last_error_code, last_response_status, sent_at, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar entregas", error);
  return z.array(deliveryRowSchema).parse(data ?? []);
}

export async function resendDelivery(client: SupabaseClient, actor: SessionActor, deliveryId: string): Promise<{ deliveryId: string }> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_webhook_resend", { p_actor_id: actor.userId, p_delivery_id: deliveryId });
  if (error) fail("reenviar entrega", error, webhookDbErrorCode(error) === "forbidden" ? "not_found" : undefined);
  return { deliveryId: z.uuid().parse(data) };
}
