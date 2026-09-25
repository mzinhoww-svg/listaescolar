import { describe, expect, it, vi } from "vitest";
import { WebPushNotifier, type WebPushSender } from "@/features/notifications/web-push-notifier";
import type { DeliveryPayload } from "@/features/notifications/ports";

const VAPID = { publicKey: "P".repeat(87), privateKey: "K".repeat(43), subject: "mailto:contato@listacerta.example" };
const delivery = (n = 1): DeliveryPayload => ({
  id: "d1", leaseId: "l1", channel: "web_push", eventType: "lead_quote_sent", linkPath: "/cotacao/LC-5TJ1", attempts: 1, isDemo: false,
  subscriptions: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, p256dh: "B".repeat(87), auth: "a".repeat(22) })), email: null,
});
const err = (statusCode: number) => Object.assign(new Error("boom"), { statusCode });

describe("WebPushNotifier", () => {
  it("VAPID ausente: skipped/vapid_unconfigured, sem chamar o serviço de push", async () => {
    const sender: WebPushSender = { send: vi.fn() };
    expect(await new WebPushNotifier({ vapid: null, sender }).deliver(delivery())).toEqual({ kind: "skipped", code: "vapid_unconfigured" });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it("envia título genérico + caminho, TTL 24 h, urgência normal; o corpo não leva params, escola, código nem status", async () => {
    const send = vi.fn(async () => undefined);
    const out = await new WebPushNotifier({ vapid: VAPID, sender: { send } }).deliver(delivery());
    expect(out).toEqual({ kind: "sent" });
    const [sub, body, opts] = send.mock.calls[0] as unknown as [{ endpoint: string }, string, { TTL: number; urgency: string }];
    expect(sub.endpoint).toBe("https://fcm.googleapis.com/fcm/send/0");
    expect(JSON.parse(body)).toEqual({ title: expect.any(String), url: "/cotacao/LC-5TJ1" });
    expect(body).not.toMatch(/Escola|quote_sent|lead_code|school/); // o único vestígio do pedido é o caminho relativo do link
    expect(opts).toMatchObject({ TTL: 86_400, urgency: "normal", timeout: 5000 }); // timeout por envio
  });
  it("404/410 revoga a assinatura; sem nenhuma ativa: skipped", async () => {
    const send = vi.fn(async () => { throw err(410); });
    const out = await new WebPushNotifier({ vapid: VAPID, sender: { send } }).deliver(delivery(2));
    expect(out).toEqual({ kind: "skipped", code: "no_active_subscription", revokeSubscriptionIds: ["s0", "s1"] });
  });
  it("uma assinatura morta e outra viva: sent, revogando só a morta", async () => {
    const send = vi.fn().mockRejectedValueOnce(err(404)).mockResolvedValueOnce(undefined);
    expect(await new WebPushNotifier({ vapid: VAPID, sender: { send } }).deliver(delivery(2))).toEqual({ kind: "sent", revokeSubscriptionIds: ["s0"] });
  });
  it.each([[429, true], [500, true], [503, true], [400, false], [403, false]])("status %i -> %s transitório", async (status, transient) => {
    const send = vi.fn(async () => { throw err(status); });
    const out = await new WebPushNotifier({ vapid: VAPID, sender: { send } }).deliver(delivery());
    expect(out).toMatchObject({ kind: "failed", transient });
    expect((out as { code: string }).code).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
  });
  it("erro de rede (sem statusCode) é transitório e o código não vaza a mensagem", async () => {
    const send = vi.fn(async () => { throw new Error("getaddrinfo ENOTFOUND push.example"); });
    const out = await new WebPushNotifier({ vapid: VAPID, sender: { send } }).deliver(delivery());
    expect(out).toEqual({ kind: "failed", transient: true, code: "push_network" });
  });

  it("anti-SSRF: endpoint fora dos serviços de push (IP, host interno, http, credencial, porta) não é chamado e a assinatura é revogada", async () => {
    const send = vi.fn(async () => undefined);
    const bad = ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://[::1]/x", "https://localhost/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.example/x", "https://u@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://evil.example/x"];
    const d = { ...delivery(0), subscriptions: bad.map((endpoint, i) => ({ id: `b${i}`, endpoint, p256dh: "B".repeat(87), auth: "a".repeat(22) })) };
    const out = await new WebPushNotifier({ vapid: VAPID, sender: { send } }).deliver(d);
    expect(send).not.toHaveBeenCalled();
    expect(out).toEqual({ kind: "skipped", code: "no_active_subscription", revokeSubscriptionIds: bad.map((_, i) => `b${i}`) });
  });
  it("hosts permitidos: FCM, Mozilla, *.push.apple.com e *.notify.windows.com; loopback http só com appEnv local/development", async () => {
    const send = vi.fn(async () => undefined);
    const mk = (endpoint: string, appEnv?: string) => new WebPushNotifier({ vapid: VAPID, sender: { send }, ...(appEnv ? { appEnv } : {}) }).deliver({ ...delivery(0), subscriptions: [{ id: "x", endpoint, p256dh: "B".repeat(87), auth: "a".repeat(22) }] });
    for (const ok of ["https://fcm.googleapis.com/fcm/send/a", "https://updates.push.services.mozilla.com/wpush/v2/a", "https://web.push.apple.com/a", "https://wns2-par02p.notify.windows.com/w/?token=a"]) expect((await mk(ok)).kind, ok).toBe("sent");
    expect((await mk("http://127.0.0.1:9911/push")).kind).toBe("skipped");
    expect((await mk("http://127.0.0.1:9911/push", "production")).kind).toBe("skipped");
    expect((await mk("http://127.0.0.1:9911/push", "local")).kind).toBe("sent");
  });
});
