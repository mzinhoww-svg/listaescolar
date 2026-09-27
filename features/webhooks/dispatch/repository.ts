import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { WEBHOOK_EVENTS } from "../events";
import type { ClaimedDelivery, MarkOutcome, WebhookDispatchRepo } from "./ports";

const claimedSchema = z.object({
  id: z.uuid(),
  leaseId: z.uuid(),
  attempts: z.number().int(),
  eventType: z.enum(WEBHOOK_EVENTS),
  eventId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  url: z.string(),
  secret: z.object({ ciphertext: z.string(), iv: z.string(), tag: z.string(), keyVersion: z.number() }),
});

/** Repositório do despacho (service role, server-only): só funções SQL. Erro do banco vira erro genérico. */
export function createWebhookDispatchRepo(client: Pick<SupabaseClient, "rpc">): WebhookDispatchRepo & { purgeOld(days: number): Promise<number> } {
  return {
    async claim(limit): Promise<ClaimedDelivery[]> {
      const { data, error } = await client.rpc("b2b_webhook_claim_deliveries", { p_limit: limit });
      if (error) throw new Error("webhook_rpc_failed");
      const parsed = z.array(claimedSchema).safeParse(data ?? []);
      if (!parsed.success) throw new Error("webhook_invalid_response");
      return parsed.data;
    },
    async mark(id: string, leaseId: string, outcome: MarkOutcome, httpStatus: number | null, errorCode: string | null, durationMs: number) {
      const { error } = await client.rpc("b2b_webhook_mark_delivery", { p_id: id, p_lease: leaseId, p_outcome: outcome, p_http_status: httpStatus, p_error_code: errorCode, p_duration_ms: durationMs });
      if (error) throw new Error("webhook_rpc_failed");
    },
    async purgeOld(days: number) {
      const { data, error } = await client.rpc("b2b_webhook_purge_old", { p_days: days });
      if (error) throw new Error("webhook_rpc_failed");
      return z.number().int().parse(data);
    },
  };
}
