// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "lc_analytics_consent" && cookieValue ? { name: n, value: cookieValue } : undefined) }),
}));

import { captureServer, captureUserAction, emitServer } from "@/lib/analytics/server";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  cookieValue = undefined;
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  vi.stubEnv("APP_ENV", "staging");
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const settle = () => new Promise((r) => setTimeout(r, 10));

describe("eventos de servidor que nascem de ação do usuário (revisão I3)", () => {
  it("sem o cookie de estado, login_completed e purchase_clicked não saem", async () => {
    await captureUserAction("login_completed", { method: "google" });
    await captureUserAction("purchase_clicked", { canal: "carrinho", retailer_slug: "loja" });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cookie diferente de 'granted' também bloqueia", async () => {
    cookieValue = "denied";
    await captureUserAction("login_completed", { method: "google" });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com lc_analytics_consent=granted, sai, com distinct_id aleatório e sem perfil", async () => {
    cookieValue = "granted";
    await captureUserAction("login_completed", { method: "magic_link" });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.event).toBe("login_completed");
    expect(body.properties.$process_person_profile).toBe(false);
    expect(body.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("leitura de cookie que falha não emite nem lança", async () => {
    cookieValue = "granted";
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => { throw new Error("fora de requisição"); } }));
    const mod = await import("@/lib/analytics/server");
    await expect(mod.captureUserAction("login_completed", { method: "google" })).resolves.toBeUndefined();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.doUnmock("next/headers");
  });

  it("captureServer e emitServer nunca emitem esses dois eventos sem passar pelo consentimento", async () => {
    captureServer("login_completed", { method: "google" });
    captureServer("purchase_clicked", { canal: "carrinho", retailer_slug: "loja" });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    // emitServer (usado pelos serviços) encaminha para o caminho com consentimento
    await emitServer("purchase_clicked", { canal: "papelaria_cotacao" });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    cookieValue = "granted";
    await emitServer("purchase_clicked", { canal: "papelaria_cotacao" });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lead_received é fato de negócio da papelaria: sai sempre, sem cookie", async () => {
    await emitServer("lead_received", { items_count_bucket: "1-5" });
    captureServer("lead_received", { items_count_bucket: "1-5" });
    await settle();
    expect(fetchMock).toHaveBeenCalled();
  });
});
