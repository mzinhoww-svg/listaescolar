import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { deny, getConsent, grant, resetConsentListenersForTests, revoke } from "@/lib/analytics/consent";
import { resetAnalyticsClientForTests } from "@/lib/analytics/instance";
import { track } from "@/lib/analytics/track";

const enable = () => { vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test"); vi.stubEnv("APP_ENV", "staging"); };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  resetConsentListenersForTests();
  resetAnalyticsClientForTests();
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const idle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe("cookie de estado do consentimento (revisão I3)", () => {
  const cookie = () => document.cookie.split("; ").find((c) => c.startsWith("lc_analytics_consent="));
  beforeEach(() => { document.cookie = "lc_analytics_consent=; Max-Age=0; Path=/"; });

  it("nenhum cookie antes da escolha; grant grava só o estado; deny e revoke apagam", () => {
    expect(cookie()).toBeUndefined();
    grant();
    expect(cookie()).toBe("lc_analytics_consent=granted");
    deny();
    expect(cookie()).toBeUndefined();
    grant();
    revoke();
    expect(cookie()).toBeUndefined();
  });

  it("cookie de estado não carrega identificador", () => {
    grant();
    expect(document.cookie).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("ao abrir com aceite guardado renova o cookie; com a escolha apagada, remove o cookie órfão", async () => {
    enable();
    grant();
    document.cookie = "lc_analytics_consent=; Max-Age=0; Path=/";
    render(<AnalyticsProvider />);
    await idle();
    expect(cookie()).toBe("lc_analytics_consent=granted");
    localStorage.clear();
    resetConsentListenersForTests();
    resetAnalyticsClientForTests();
    render(<AnalyticsProvider />);
    await idle();
    expect(cookie()).toBeUndefined();
  });
});

describe("revogação propaga entre abas (revisão M3)", () => {
  const storageEvent = (key: string | null, newValue: string | null) =>
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key, newValue })); });

  it("evento `storage` de revogação em outra aba limpa fila, id e envio nesta", async () => {
    enable();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    grant();
    render(<AnalyticsProvider />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    const { getAnalyticsClient } = await import("@/lib/analytics/instance");
    const client = getAnalyticsClient()!;
    expect(client.state().consent).toBe("granted");
    track("login_started", { method: "google" });
    expect(client.state().queued).toBe(1);
    const before = client.state().distinctId;
    // A outra aba revogou: gravou "denied" e apagou o id.
    localStorage.setItem("lc_analytics_consent_v1", "denied");
    localStorage.removeItem("lc_analytics_id");
    storageEvent("lc_analytics_consent_v1", "denied");
    expect(client.state()).toMatchObject({ consent: "denied", queued: 0 });
    expect(client.state().distinctId).not.toBe(before);
    expect(localStorage.getItem("lc_analytics_id")).toBeNull();
    track("login_started", { method: "google" });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("storage.clear() em outra aba (key null) derruba quem tinha aceitado, mas não inventa recusa para quem não escolheu", async () => {
    enable();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    grant();
    render(<AnalyticsProvider />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    const { getAnalyticsClient } = await import("@/lib/analytics/instance");
    storageEvent(null, null);
    expect(getAnalyticsClient()!.state().consent).toBe("denied");
  });

  it("sem escolha nesta aba, storage.clear() não a marca como recusada", async () => {
    enable();
    render(<AnalyticsProvider />);
    await idle();
    storageEvent(null, null);
    expect(getConsent()).toBe("unset");
    expect(screen.getByRole("region", { name: /medição de uso/i })).toBeInTheDocument();
  });

  it("aceite em outra aba libera esta; chave alheia é ignorada", async () => {
    enable();
    render(<AnalyticsProvider />);
    await idle();
    storageEvent("outra_chave", "granted");
    expect(getConsent()).toBe("unset");
    storageEvent("lc_analytics_consent_v1", "granted");
    expect(getConsent()).toBe("granted");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
