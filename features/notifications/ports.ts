import type { NotificationEvent } from "./catalog";

export type DeliveryChannel = "web_push" | "email";
export type PushSubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** Uma entrega reivindicada (`notification_claim_deliveries`). Não carrega `params`: push e e-mail só levam o que o catálogo permite. */
export type DeliveryPayload = {
  id: string;
  /** Dono da lease: só ele marca o resultado (marcação atrasada é ignorada pelo banco). */
  leaseId: string;
  channel: DeliveryChannel;
  eventType: NotificationEvent;
  linkPath: string;
  attempts: number;
  isDemo: boolean;
  subscriptions: PushSubscriptionRow[];
  email: string | null;
};

type Revoke = { revokeSubscriptionIds?: string[] };
export type DeliveryOutcome =
  | ({ kind: "sent" } & Revoke)
  | ({ kind: "skipped"; code: string } & Revoke)
  | ({ kind: "failed"; transient: boolean; code: string } & Revoke);

export interface Notifier {
  readonly channel: DeliveryChannel;
  deliver(d: DeliveryPayload): Promise<DeliveryOutcome>;
}

export type MarkOutcome = "sent" | "transient" | "permanent" | "skipped";
export interface NotificationRepo {
  claim(limit: number): Promise<DeliveryPayload[]>;
  mark(id: string, leaseId: string, outcome: MarkOutcome, code: string | null, revokeSubscriptionIds: string[]): Promise<void>;
}

/** Notificador para testes. */
export class MemoryNotifier implements Notifier {
  readonly delivered: DeliveryPayload[] = [];
  constructor(
    readonly channel: DeliveryChannel,
    private readonly fn: (d: DeliveryPayload) => Promise<DeliveryOutcome> = async () => ({ kind: "sent" }),
  ) {}
  async deliver(d: DeliveryPayload): Promise<DeliveryOutcome> {
    this.delivered.push(d);
    return this.fn(d);
  }
}
