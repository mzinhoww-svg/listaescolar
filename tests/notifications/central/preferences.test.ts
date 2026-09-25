import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENTS } from "@/features/notifications/catalog";
import { channelAvailability, parsePushSubscription, preferenceEnabled, savePreferenceSchema, watchSchema, externalEvents } from "@/features/notifications/preferences";

const KEYS = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

describe("preferências", () => {
  it("ausência = padrão do catálogo: web_push e e-mail desligados", () => {
    expect(preferenceEnabled([], "submission_ready", "web_push")).toBe(false);
    expect(preferenceEnabled([{ event_type: "submission_ready", channel: "web_push", enabled: true }], "submission_ready", "web_push")).toBe(true);
    expect(preferenceEnabled([{ event_type: "submission_ready", channel: "web_push", enabled: true }], "submission_ready", "email")).toBe(false);
  });
  it("só eventos com canal externo aparecem na matriz (publication_orphaned é só da central)", () => {
    expect(externalEvents()).toHaveLength(NOTIFICATION_EVENTS.length - 1);
    expect(externalEvents()).not.toContain("publication_orphaned");
  });
  it("disponibilidade real: web push só com VAPID público; e-mail só com flag, chave e remetente", () => {
    expect(channelAvailability({})).toEqual({ web_push: false, email: false });
    expect(channelAvailability({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "P".repeat(87) }).web_push).toBe(true);
    expect(channelAvailability({ EMAIL_NOTIFICATIONS_ENABLED: "1", EMAIL_API_KEY: "k", EMAIL_FROM: "a@b.co" }).email).toBe(true);
    expect(channelAvailability({ EMAIL_NOTIFICATIONS_ENABLED: "1", EMAIL_API_KEY: "k" }).email).toBe(false);
    expect(channelAvailability({ EMAIL_NOTIFICATIONS_ENABLED: "0", EMAIL_API_KEY: "k", EMAIL_FROM: "a@b.co" }).email).toBe(false);
  });
  it("savePreferenceSchema é estrito (evento e canal do catálogo; sem profile_id)", () => {
    expect(savePreferenceSchema.safeParse({ event: "lead_received", channel: "web_push", enabled: true }).success).toBe(true);
    for (const bad of [{ event: "x", channel: "web_push", enabled: true }, { event: "lead_received", channel: "sms", enabled: true }, { event: "lead_received", channel: "email", enabled: "sim" }, { event: "lead_received", channel: "email", enabled: true, profile_id: "x" }]) {
      expect(savePreferenceSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("watchSchema: INEP de 8 dígitos, série do catálogo em slug e ano plausível", () => {
    expect(watchSchema.safeParse({ inep: "51000001", gradeSlug: "ef-4", year: 2027 }).success).toBe(true);
    for (const bad of [{ inep: "123", gradeSlug: "ef-4", year: 2027 }, { inep: "51000001", gradeSlug: "EF 4", year: 2027 }, { inep: "51000001", gradeSlug: "ef-4", year: 1999 }]) expect(watchSchema.safeParse(bad).success).toBe(false);
  });
});

describe("parsePushSubscription (Zod da fronteira)", () => {
  const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: KEYS };
  it("aceita https; recusa http, javascript:, tamanho excessivo e chaves fora de base64url", () => {
    expect(parsePushSubscription(ok, "production").success).toBe(true);
    for (const endpoint of ["https://evil.example/x", "https://127.0.0.1/x", "http://evil.example/x", "javascript:alert(1)", "https://x.example/" + "a".repeat(2000), "ftp://x.example/a"]) expect(parsePushSubscription({ ...ok, endpoint }, "production").success, endpoint).toBe(false);
    expect(parsePushSubscription({ ...ok, keys: { ...KEYS, p256dh: "não é base64!" } }, "production").success).toBe(false);
    expect(parsePushSubscription({ ...ok, extra: 1 }, "production").success).toBe(false);
  });
  it("http de loopback só com APP_ENV local ou development", () => {
    const lo = { endpoint: "http://127.0.0.1:9911/push", keys: KEYS };
    expect(parsePushSubscription(lo, "local").success).toBe(true);
    expect(parsePushSubscription(lo, "development").success).toBe(true);
    for (const env of ["production", "staging", "preview", undefined]) expect(parsePushSubscription(lo, env).success, String(env)).toBe(false);
  });
});
