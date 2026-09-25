// Transporte de e-mail atrás de flag: `NullEmailTransport` (padrão) nunca toca a rede; `ResendEmailTransport` usa `fetch` (sem SDK).
export type EmailMessage = { to: string; subject: string; text: string };

export class EmailSendError extends Error {
  constructor(readonly transient: boolean, readonly code: string) {
    super(code);
    this.name = "EmailSendError";
  }
}

export interface EmailTransport {
  readonly available: boolean;
  send(msg: EmailMessage): Promise<void>;
}

export class NullEmailTransport implements EmailTransport {
  readonly available = false;
  async send(): Promise<void> {
    throw new EmailSendError(false, "email_transport_unavailable");
  }
}

export class ResendEmailTransport implements EmailTransport {
  readonly available = true;
  private readonly doFetch: typeof fetch;
  constructor(private readonly o: { apiKey: string; from: string; fetch?: typeof fetch }) {
    this.doFetch = o.fetch ?? fetch;
  }
  async send(msg: EmailMessage): Promise<void> {
    let res: Response;
    try {
      res = await this.doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${this.o.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: this.o.from, to: [msg.to], subject: msg.subject, text: msg.text }),
      });
    } catch {
      throw new EmailSendError(true, "email_network");
    }
    if (res.ok) return;
    if (res.status === 429) throw new EmailSendError(true, "email_rate_limited");
    if (res.status >= 500) throw new EmailSendError(true, "email_5xx");
    throw new EmailSendError(false, "email_4xx");
  }
}
