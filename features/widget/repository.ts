import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import { myPartnerId } from "@/features/b2b/repository";

import { widgetDbErrorCode, WidgetServiceError } from "./errors";

function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new WidgetServiceError("ator não vem da sessão", "forbidden");
}

export type WidgetConfigRow = { partnerId: string; accentColor: string; cartTargetDomain: string; enabled: boolean };
const rowSchema = z
  .object({ partner_id: z.uuid(), accent_color: z.string(), cart_target_domain: z.string(), enabled: z.boolean() })
  .transform((r) => ({ partnerId: r.partner_id, accentColor: r.accent_color, cartTargetDomain: r.cart_target_domain, enabled: r.enabled }));

export async function getMyWidgetConfig(client: SupabaseClient, actor: SessionActor): Promise<WidgetConfigRow | null> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) return null;
  const { data, error } = await client.from("b2b_widget_configs").select("partner_id, accent_color, cart_target_domain, enabled").eq("partner_id", partnerId).maybeSingle();
  if (error) throw new WidgetServiceError(`ler configuração do widget: ${error.message}`, widgetDbErrorCode(error), error.code);
  return data ? rowSchema.parse(data) : null;
}

export async function saveWidgetConfig(client: SupabaseClient, actor: SessionActor, input: { accentColor: string; cartTargetDomain: string; enabled: boolean }): Promise<void> {
  requireActor(actor);
  const partnerId = await myPartnerId(client, actor);
  if (!partnerId) throw new WidgetServiceError("parceiro não encontrado", "not_found");
  const { error } = await client.rpc("b2b_widget_config_save", {
    p_actor_id: actor.userId,
    p_partner_id: partnerId,
    p_accent_color: input.accentColor,
    p_cart_target_domain: input.cartTargetDomain,
    p_enabled: input.enabled,
  });
  if (error) throw new WidgetServiceError(`salvar configuração do widget: ${error.message}`, widgetDbErrorCode(error), error.code);
}
