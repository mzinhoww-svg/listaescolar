import "server-only";

import { postWebhookSafely } from "@/lib/net/safe-fetch";

import { decryptSecret } from "../crypto";
import { signPayload, SIGNATURE_HEADER } from "../sign";
import type { ClaimedDelivery, SendOutcome, WebhookSender } from "./ports";

export type HttpWebhookSenderDeps = { encryptionKey: () => string | undefined; appEnv?: string; timeoutMs?: number };

/** Único lugar que decifra o segredo para assinar e chama a rede (`postWebhookSafely`, anti-SSRF). */
export class HttpWebhookSender implements WebhookSender {
  constructor(private readonly deps: HttpWebhookSenderDeps) {}

  async send(d: ClaimedDelivery): Promise<SendOutcome> {
    const key = this.deps.encryptionKey();
    if (!key) return { mark: "transient", httpStatus: null, errorCode: "service_unavailable" };

    let secret: string;
    try {
      secret = decryptSecret(
        { ciphertext: Buffer.from(d.secret.ciphertext, "base64"), iv: Buffer.from(d.secret.iv, "base64"), tag: Buffer.from(d.secret.tag, "base64") },
        key,
      );
    } catch {
      // segredo cifrado com uma versão de chave que este processo não tem mais: nunca vai adiante sozinho.
      return { mark: "permanent", httpStatus: null, errorCode: "secret_undecryptable" };
    }

    const body = JSON.stringify({ id: d.eventId, event: d.eventType, created_at: d.createdAt, data: d.payload });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(secret, timestamp, body);
    const outcome = await postWebhookSafely(d.url, {
      headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signature, "user-agent": "ListaCerta-Webhooks/1.0" },
      body,
      appEnv: this.deps.appEnv,
      timeoutMs: this.deps.timeoutMs,
    });
    if (outcome.kind === "sent") return { mark: "sent", httpStatus: outcome.status, errorCode: null };
    return { mark: outcome.kind, httpStatus: outcome.status ?? null, errorCode: outcome.code };
  }
}
