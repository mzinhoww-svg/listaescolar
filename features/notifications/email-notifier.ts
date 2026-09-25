import { EVENT_CATALOG } from "./catalog";
import { isSafeLinkPath } from "./params";
import { EmailSendError, type EmailTransport } from "./email-transport";
import type { DeliveryOutcome, DeliveryPayload, Notifier } from "./ports";

/** E-mail: assunto genérico e o link; sem params (escola, status). Desligado por padrão (flag + transporte). */
export class EmailNotifier implements Notifier {
  readonly channel = "email" as const;
  constructor(private readonly o: { enabled: boolean; transport: EmailTransport; siteOrigin: string }) {}

  async deliver(d: DeliveryPayload): Promise<DeliveryOutcome> {
    if (!this.o.enabled) return { kind: "skipped", code: "email_disabled" };
    if (!d.email) return { kind: "skipped", code: "no_recipient" };
    if (!this.o.transport.available) return { kind: "skipped", code: "email_transport_unavailable" };
    if (!isSafeLinkPath(d.linkPath)) return { kind: "failed", transient: false, code: "invalid_link" };
    const subject = EVENT_CATALOG[d.eventType].pushTitle;
    const text = `${subject}.\n\nAbra: ${this.o.siteOrigin}${d.linkPath}\n\nVocê recebe este aviso porque ligou as notificações por e-mail no ListaCerta.`;
    try {
      await this.o.transport.send({ to: d.email, subject, text });
      return { kind: "sent" };
    } catch (e) {
      if (e instanceof EmailSendError) return { kind: "failed", transient: e.transient, code: e.code };
      return { kind: "failed", transient: true, code: "email_error" };
    }
  }
}
