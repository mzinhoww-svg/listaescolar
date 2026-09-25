import "server-only";

import { getSiteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

import { runDispatch, type DispatchSummary } from "./dispatcher";
import { EmailNotifier } from "./email-notifier";
import { NullEmailTransport, ResendEmailTransport } from "./email-transport";
import type { Notifier } from "./ports";
import { createNotificationRepo } from "./repository";
import { WebPushNotifier, type VapidConfig } from "./web-push-notifier";

export const READ_NOTIFICATION_RETENTION_DAYS = 180;
const t = (v: string | undefined): string => (v ?? "").trim();

/** VAPID só com os três valores (a chave privada nunca é logada). */
export function vapidFromEnv(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = t(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = t(env.VAPID_PRIVATE_KEY);
  const subject = t(env.VAPID_SUBJECT);
  return publicKey && privateKey && /^(mailto:|https:)/.test(subject) ? { publicKey, privateKey, subject } : null;
}

/** E-mail só com EMAIL_NOTIFICATIONS_ENABLED=1 + chave + remetente; fora disso, transporte nulo (nunca chama a rede). */
export function buildNotifiers(env: NodeJS.ProcessEnv = process.env): Notifier[] {
  const enabled = t(env.EMAIL_NOTIFICATIONS_ENABLED) === "1" && t(env.EMAIL_API_KEY) !== "" && t(env.EMAIL_FROM) !== "";
  const transport = enabled ? new ResendEmailTransport({ apiKey: t(env.EMAIL_API_KEY), from: t(env.EMAIL_FROM) }) : new NullEmailTransport();
  return [new WebPushNotifier({ vapid: vapidFromEnv(env) }), new EmailNotifier({ enabled, transport, siteOrigin: getSiteOrigin() })];
}

/** Um ciclo: expira tokens de reivindicação (D-047, gera claim_updated), despacha entregas e apaga notificações lidas antigas. */
export async function runNotificationCycle(): Promise<{ expiredTokens: number; dispatch: DispatchSummary; purged: number }> {
  const repo = createNotificationRepo(createAdminClient());
  const expiredTokens = await repo.expireClaimTokens();
  const dispatch = await runDispatch({ repo, notifiers: buildNotifiers(), limit: 25 });
  const purged = await repo.purgeOld(READ_NOTIFICATION_RETENTION_DAYS);
  return { expiredTokens, dispatch, purged };
}
