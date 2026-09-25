import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { NOTIFICATION_EVENTS } from "./catalog";
import type { DeliveryPayload, MarkOutcome, NotificationRepo } from "./ports";

const delivery = z.object({
  id: z.string().uuid(),
  leaseId: z.string().uuid(),
  channel: z.enum(["web_push", "email"]),
  eventType: z.enum(NOTIFICATION_EVENTS),
  linkPath: z.string().max(300),
  attempts: z.number().int(),
  isDemo: z.boolean(),
  subscriptions: z.array(z.object({ id: z.string().uuid(), endpoint: z.string(), p256dh: z.string(), auth: z.string() })),
  email: z.string().nullable(),
});

/** Repositório do despacho (service role, server-only): só funções SQL. Erro do banco vira erro genérico (sem mensagem). */
export function createNotificationRepo(client: Pick<SupabaseClient, "rpc">): NotificationRepo & {
  expireClaimTokens(): Promise<number>;
  purgeOld(days: number): Promise<number>;
} {
  const call = async (fn: string, args: Record<string, unknown> | undefined): Promise<unknown> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error("notification_rpc_failed");
    return data;
  };
  return {
    async claim(limit): Promise<DeliveryPayload[]> {
      const parsed = z.array(delivery).safeParse((await call("notification_claim_deliveries", { p_limit: limit })) ?? []);
      if (!parsed.success) throw new Error("notification_invalid_response");
      return parsed.data;
    },
    async mark(id: string, leaseId: string, outcome: MarkOutcome, code: string | null, revoke: string[]) {
      await call("notification_mark_delivery", { p_id: id, p_lease: leaseId, p_outcome: outcome, p_code: code, p_revoke: revoke.length > 0 ? revoke : null });
    },
    async expireClaimTokens() {
      return z.number().int().parse(await call("claim_expire_tokens", {}));
    },
    async purgeOld(days: number) {
      return z.number().int().parse(await call("notification_purge_old", { p_days: days }));
    },
  };
}
