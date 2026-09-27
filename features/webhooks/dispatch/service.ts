import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv, getPipelineFlags } from "@/lib/env";

import { runWebhookDispatch, type DispatchSummary } from "./dispatcher";
import { createWebhookDispatchRepo } from "./repository";
import { HttpWebhookSender } from "./sender";

export const WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

function encryptionKey(): string | undefined {
  try {
    return getServerEnv().B2B_WEBHOOK_ENCRYPTION_KEY;
  } catch (error) {
    console.error("webhook dispatch: encryption key/env", error instanceof Error ? error.name : "erro");
    return undefined;
  }
}

/** Um ciclo: despacha entregas vencidas e poda as antigas (`sent`/`dead` com mais de 30 dias). */
export async function runWebhookDispatchCycle(): Promise<{ dispatch: DispatchSummary; purged: number }> {
  const repo = createWebhookDispatchRepo(createAdminClient());
  const appEnv = getPipelineFlags().APP_ENV;
  const sender = new HttpWebhookSender({ encryptionKey, appEnv });
  const dispatch = await runWebhookDispatch({ repo, sender, limit: 10 });
  const purged = await repo.purgeOld(WEBHOOK_DELIVERY_RETENTION_DAYS);
  return { dispatch, purged };
}
