// Catálogo de eventos de webhook (S25). Espelha o enum `public.b2b_webhook_event_type` (0502); um teste de
// contrato compara TS × SQL.

export const WEBHOOK_EVENTS = ["list.published", "list.updated", "list.archived", "school.approved"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
