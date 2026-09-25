import { describe, expect, it, vi } from "vitest";
import { WebPushNotifier, type WebPushSender } from "@/features/notifications/web-push-notifier";
import type { DeliveryPayload } from "@/features/notifications/ports";

const VAPID = { publicKey: "P".repeat(87), privateKey: "K".repeat(43), subject: "mailto:contato@listacerta.example" };
const delivery = (n = 1): DeliveryPayload => ({
  id: "d1", channel: "web_push", eventType: "lead_quote_sent", linkPath: "/cotacao/LC-5TJ1", attempts: 1, isDemo: false,
  subscriptions: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, endpoint: `https://push.example/${i}`, p256dh: "B".repeat(87), auth: "a".repeat(22) })), email: null,
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
    expect(sub.endpoint).toBe("https://push.example/0");
    expect(JSON.parse(body)).toEqual({ title: expect.any(String), url: "/cotacao/LC-5TJ1" });
    expect(body).not.toMatch(/Escola|quote_sent|lead_code|school/); // o único vestígio do pedido é o caminho relativo do link
    expect(opts).toMatchObject({ TTL: 86_400, urgency: "normal" });
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
});
