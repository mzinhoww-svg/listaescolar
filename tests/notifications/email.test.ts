import { describe, expect, it, vi } from "vitest";
import { EmailNotifier } from "@/features/notifications/email-notifier";
import { NullEmailTransport, ResendEmailTransport } from "@/features/notifications/email-transport";
import type { DeliveryPayload } from "@/features/notifications/ports";

const delivery: DeliveryPayload = { id: "d1", leaseId: "l1", channel: "email", eventType: "lead_quote_sent", linkPath: "/cotacao/LC-5TJ1", attempts: 1, isDemo: false, subscriptions: [], email: "pai@exemplo.invalid" };
const resp = (status: number) => vi.fn(async () => new Response("{}", { status }));

describe("EmailNotifier", () => {
  it("flag desligada: skipped/email_disabled e NENHUM fetch", async () => {
    const fetchFn = resp(200);
    const n = new EmailNotifier({ enabled: false, transport: new ResendEmailTransport({ apiKey: "re_x", from: "a@b.co", fetch: fetchFn }), siteOrigin: "https://listacerta.example" });
    expect(await n.deliver(delivery)).toEqual({ kind: "skipped", code: "email_disabled" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("NullEmailTransport nunca chama a rede e devolve indisponível", async () => {
    const fetchFn = resp(200);
    vi.stubGlobal("fetch", fetchFn);
    const out = await new EmailNotifier({ enabled: true, transport: new NullEmailTransport(), siteOrigin: "https://listacerta.example" }).deliver(delivery);
    vi.unstubAllGlobals();
    expect(out).toEqual({ kind: "skipped", code: "email_transport_unavailable" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("ligada: um fetch ao provedor com assunto genérico e sem params (sem escola, código ou status no corpo)", async () => {
    const fetchFn = resp(200);
    const n = new EmailNotifier({ enabled: true, transport: new ResendEmailTransport({ apiKey: "re_teste_x", from: "ListaCerta <aviso@listacerta.example>", fetch: fetchFn }), siteOrigin: "https://listacerta.example" });
    expect(await n.deliver(delivery)).toEqual({ kind: "sent" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_teste_x");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["pai@exemplo.invalid"]);
    expect(body.subject).not.toMatch(/Escola|LC-|quote_sent/);
    expect(body.text).toContain("https://listacerta.example/cotacao/LC-5TJ1");
    expect(body.text).not.toMatch(/Escola|quote_sent|approved/);
  });
  it("5xx e 429 são transitórios; 4xx é permanente; rede é transitória", async () => {
    const mk = (fetchFn: typeof fetch) => new EmailNotifier({ enabled: true, transport: new ResendEmailTransport({ apiKey: "re_x", from: "a@b.co", fetch: fetchFn }), siteOrigin: "https://x.example" });
    expect(await mk(resp(503)).deliver(delivery)).toMatchObject({ kind: "failed", transient: true });
    expect(await mk(resp(429)).deliver(delivery)).toMatchObject({ kind: "failed", transient: true });
    expect(await mk(resp(422)).deliver(delivery)).toMatchObject({ kind: "failed", transient: false });
    expect(await mk(vi.fn(async () => { throw new Error("x"); })).deliver(delivery)).toMatchObject({ kind: "failed", transient: true });
  });
  it("sem e-mail do destinatário: skipped/no_recipient", async () => {
    const n = new EmailNotifier({ enabled: true, transport: new NullEmailTransport(), siteOrigin: "https://x.example" });
    expect(await n.deliver({ ...delivery, email: null })).toEqual({ kind: "skipped", code: "no_recipient" });
  });
});
