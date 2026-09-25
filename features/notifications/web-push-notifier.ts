// ÚNICO lugar que importa `web-push`. Push leva só título genérico e caminho do link (pushPayload), cifrado pelo protocolo.
import webpush from "web-push";

import { pushPayload } from "./copy";
import type { DeliveryOutcome, DeliveryPayload, Notifier, PushSubscriptionRow } from "./ports";

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export type PushSendOptions = { TTL: number; urgency: "very-low" | "low" | "normal" | "high"; vapidDetails: VapidConfig };
export interface WebPushSender {
  send(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, options: PushSendOptions): Promise<unknown>;
}

const defaultSender: WebPushSender = {
  send: (sub, body, options) =>
    webpush.sendNotification(sub, body, { TTL: options.TTL, urgency: options.urgency, vapidDetails: { subject: options.vapidDetails.subject, publicKey: options.vapidDetails.publicKey, privateKey: options.vapidDetails.privateKey } }),
};

const statusOf = (e: unknown): number | null => {
  const s = (e as { statusCode?: unknown } | null)?.statusCode;
  return typeof s === "number" ? s : null;
};

export class WebPushNotifier implements Notifier {
  readonly channel = "web_push" as const;
  private readonly vapid: VapidConfig | null;
  private readonly sender: WebPushSender;
  constructor(o: { vapid: VapidConfig | null; sender?: WebPushSender }) {
    this.vapid = o.vapid;
    this.sender = o.sender ?? defaultSender;
  }

  async deliver(d: DeliveryPayload): Promise<DeliveryOutcome> {
    if (!this.vapid) return { kind: "skipped", code: "vapid_unconfigured" };
    const body = JSON.stringify(pushPayload(d.eventType, d.linkPath));
    const revoke: string[] = [];
    let sent = false;
    let transient = false;
    let failCode: string | null = null;
    for (const s of d.subscriptions as PushSubscriptionRow[]) {
      try {
        await this.sender.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86_400, urgency: "normal", vapidDetails: this.vapid });
        sent = true;
      } catch (e) {
        const status = statusOf(e);
        if (status === 404 || status === 410) revoke.push(s.id);
        else if (status === null) { transient = true; failCode ??= "push_network"; }
        else if (status === 429 || status >= 500) { transient = true; failCode = status === 429 ? "push_rate_limited" : "push_5xx"; }
        else failCode ??= "push_4xx";
      }
    }
    const extra = revoke.length > 0 ? { revokeSubscriptionIds: revoke } : {};
    if (sent) return { kind: "sent", ...extra };
    if (failCode) return { kind: "failed", transient, code: failCode, ...extra };
    return { kind: "skipped", code: "no_active_subscription", ...extra };
  }
}
