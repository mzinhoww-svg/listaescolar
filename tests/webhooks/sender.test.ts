import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const postWebhookSafelyMock = vi.fn();
vi.mock("@/lib/net/safe-fetch", () => ({ postWebhookSafely: (...a: unknown[]) => postWebhookSafelyMock(...a) }));

const { encryptSecret } = await import("@/features/webhooks/crypto");
const { verifySignature, SIGNATURE_HEADER } = await import("@/features/webhooks/sign");
const { HttpWebhookSender } = await import("@/features/webhooks/dispatch/sender");
const KEY = randomBytes(32).toString("hex");

function claimed(secretPlain: string) {
  const enc = encryptSecret(secretPlain, KEY);
  return {
    id: "d1", leaseId: "l1", attempts: 1, eventType: "list.published" as const, eventId: "e1",
    payload: { school: { inep: "51999901" } }, createdAt: "2026-09-27T00:00:00Z", url: "https://parceiro.example.com/hook",
    secret: { ciphertext: enc.ciphertext.toString("base64"), iv: enc.iv.toString("base64"), tag: enc.tag.toString("base64"), keyVersion: 1 },
  };
}

describe("HttpWebhookSender", () => {
  it("decifra o segredo, assina o corpo exato e mapeia sent/transient/permanent", async () => {
    postWebhookSafelyMock.mockResolvedValue({ kind: "sent", status: 200 });
    const sender = new HttpWebhookSender({ encryptionKey: () => KEY, appEnv: "local" });
    const d = claimed("whsec_teste");
    const out = await sender.send(d);
    expect(out).toEqual({ mark: "sent", httpStatus: 200, errorCode: null });

    expect(postWebhookSafelyMock).toHaveBeenCalledTimes(1);
    const [url, opts] = postWebhookSafelyMock.mock.calls[0]!;
    expect(url).toBe(d.url);
    const body = (opts as { body: string }).body;
    expect(JSON.parse(body)).toEqual({ id: "e1", event: "list.published", created_at: d.createdAt, data: d.payload });
    const header = (opts as { headers: Record<string, string> }).headers[SIGNATURE_HEADER]!;
    expect(verifySignature("whsec_teste", header, body)).toEqual({ ok: true });
  });

  it("sem chave de cifra: transient/service_unavailable, nunca chama a rede", async () => {
    const sender = new HttpWebhookSender({ encryptionKey: () => undefined });
    const out = await sender.send(claimed("whsec_x"));
    expect(out).toEqual({ mark: "transient", httpStatus: null, errorCode: "service_unavailable" });
    expect(postWebhookSafelyMock).not.toHaveBeenCalled();
  });

  it("segredo cifrado com outra chave (rotação de B2B_WEBHOOK_ENCRYPTION_KEY): permanent/secret_undecryptable", async () => {
    const sender = new HttpWebhookSender({ encryptionKey: () => randomBytes(32).toString("hex") });
    const out = await sender.send(claimed("whsec_x"));
    expect(out).toEqual({ mark: "permanent", httpStatus: null, errorCode: "secret_undecryptable" });
    expect(postWebhookSafelyMock).not.toHaveBeenCalled();
  });

  it("transient/permanent do safe-fetch propagam com o status", async () => {
    postWebhookSafelyMock.mockResolvedValue({ kind: "transient", code: "upstream_5xx", status: 503 });
    const sender = new HttpWebhookSender({ encryptionKey: () => KEY });
    expect(await sender.send(claimed("whsec_y"))).toEqual({ mark: "transient", httpStatus: 503, errorCode: "upstream_5xx" });
  });
});
