import type { WebhookEvent } from "../events";

// Fila de despacho de webhooks (S25). Mesmo desenho de `features/notifications/ports.ts`: repositório com
// `claim`/`mark` (lease no banco) e um `Sender` injetável (testável sem rede).

export type ClaimedDelivery = {
  id: string;
  leaseId: string;
  attempts: number;
  eventType: WebhookEvent;
  eventId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  url: string;
  secret: { ciphertext: string; iv: string; tag: string; keyVersion: number }; // base64, ainda cifrado
};

export type MarkOutcome = "sent" | "transient" | "permanent";

export interface WebhookDispatchRepo {
  claim(limit: number): Promise<ClaimedDelivery[]>;
  mark(id: string, leaseId: string, outcome: MarkOutcome, httpStatus: number | null, errorCode: string | null, durationMs: number): Promise<void>;
}

export type SendOutcome = { mark: MarkOutcome; httpStatus: number | null; errorCode: string | null };

export interface WebhookSender {
  send(d: ClaimedDelivery): Promise<SendOutcome>;
}
