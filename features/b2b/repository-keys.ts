import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { KEY_ROTATION_GRACE_DAYS } from "./limits";
import type { B2bScope } from "./scopes";
import { myPartnerId } from "./repository-overview";
import { fail, failMasked, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
// ---------------------------------------------------------------------------
// Chaves (B2B02)
// ---------------------------------------------------------------------------

export type CreatedKeyRecord = { keyId: string };

/** Ambiente da chave (para o serviço rotular a chave nova rotacionada com o mesmo ambiente da antiga). Filtra por
 * posse (`partner_id` do ATOR, não só o `keyId`) — revisão de segurança independente, achado 7: antes, qualquer
 * `keyId` de QUALQUER parceiro revelava aqui o ambiente antes mesmo de `b2b_key_rotate` (chamado depois, esse sim já
 * checava posse) rodar. `null` para chave inexistente OU de outro parceiro — mesma resposta nos dois casos, de
 * propósito (nunca revela qual dos dois aconteceu). `b2b_key_rotate` já trata `null` como "chave não encontrada". */
export async function getKeyEnvironment(client: SupabaseClient, actor: SessionActor, keyId: string): Promise<"test" | "live" | null> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) return null;
  const { data, error } = await client.from("b2b_api_keys").select("environment").eq("id", keyId).eq("partner_id", partnerId).maybeSingle();
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
