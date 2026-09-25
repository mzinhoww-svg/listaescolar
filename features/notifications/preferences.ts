// Preferências e disponibilidade de canais (puro: roda em Server Components, actions e testes). Zod nas fronteiras.
import { z } from "zod";

import { EVENT_CATALOG, NOTIFICATION_EVENTS, type NotificationEvent } from "./catalog";
import { isAllowedPushEndpoint } from "./push-endpoint";
import type { PreferenceRow } from "./queries-types";

export const PREFERENCE_CHANNELS = ["web_push", "email"] as const;
export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number];
export type ChannelAvailability = Record<PreferenceChannel, boolean>;

/** Eventos que aceitam canal externo (o da central sozinha, como o aviso de admin, não aparece nas preferências). */
export const externalEvents = (): NotificationEvent[] => NOTIFICATION_EVENTS.filter((e) => EVENT_CATALOG[e].external);

/** Ausência de linha = padrão do catálogo: web_push e e-mail desligados. */
export function preferenceEnabled(rows: readonly PreferenceRow[], event: string, channel: PreferenceChannel): boolean {
  return rows.find((r) => r.event_type === event && r.channel === channel)?.enabled ?? false;
}

const t = (v: string | undefined): string => (v ?? "").trim();
/** O que existe DE FATO neste ambiente: nada de prometer canal desligado. */
export function channelAvailability(env: Record<string, string | undefined>): ChannelAvailability {
  return {
    web_push: t(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) !== "",
    email: t(env.EMAIL_NOTIFICATIONS_ENABLED) === "1" && t(env.EMAIL_API_KEY) !== "" && t(env.EMAIL_FROM) !== "",
  };
}

export const savePreferenceSchema = z
  .object({ event: z.enum(externalEvents() as [NotificationEvent, ...NotificationEvent[]]), channel: z.enum(PREFERENCE_CHANNELS), enabled: z.boolean() })
  .strict();

const b64url = (min: number, max: number) => z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}$`));
/** Fronteira da inscrição de push: endpoint só de serviço de push conhecido (loopback http só em local/development); chaves base64url. */
export function parsePushSubscription(raw: unknown, appEnv: string | undefined) {
  return z
    .object({
      endpoint: z.string().max(2000).refine((e) => isAllowedPushEndpoint(e, appEnv), "endpoint não permitido"),
      keys: z.object({ p256dh: b64url(20, 200), auth: b64url(10, 100) }).strict(),
    })
    .strict()
    .safeParse(raw);
}
export const unsubscribeSchema = z.object({ endpoint: z.string().max(2000) }).strict();

export const watchSchema = z
  .object({ inep: z.string().regex(/^\d{8}$/), gradeSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40), year: z.number().int().min(2000).max(2100) })
  .strict();
export type WatchInput = z.infer<typeof watchSchema>;
