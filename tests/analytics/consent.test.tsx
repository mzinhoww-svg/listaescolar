import { act, fireEvent, render, screen } from "@testing-library/react";
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

describe("consentimento", () => {
  it("começa 'unset'; grant e deny persistem só depois da escolha; revoke limpa o id", () => {
    expect(getConsent()).toBe("unset");
    expect(localStorage.length).toBe(0);
    grant();
    expect(getConsent()).toBe("granted");
    expect(localStorage.length).toBeGreaterThan(0);
    revoke();
    expect(getConsent()).toBe("denied");
    expect(localStorage.getItem("lc_analytics_id")).toBeNull();
    deny();
    expect(getConsent()).toBe("denied");
  });

  it("storage indisponível não lança", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getConsent()).toBe("unset");
    expect(() => grant()).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("AnalyticsProvider", () => {
  it("sem chave: nenhum nó no DOM e nenhum fetch, mesmo com track()", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { container } = render(<AnalyticsProvider />);
    track("login_started", { method: "google" });
    await idle();
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("com chave e sem escolha: mostra o aviso com dois botões de 48 px, não envia nem grava nada", async () => {
    enable();
    render(<AnalyticsProvider />);
    await idle();
    const region = screen.getByRole("region", { name: /medição de uso/i });
    expect(region).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Aceitar", "Recusar"]);
    for (const b of buttons) expect(b.className).toMatch(/\bh-12\b/);
    track("school_searched", { query_length: 3, results_count: 1, has_filters: false });
    await idle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("Recusar: aviso some, fila descartada, zero requisições; escolha lembrada sem novo aviso", async () => {
    enable();
    const { unmount } = render(<AnalyticsProvider />);
    await idle();
    track("school_searched", { query_length: 3, results_count: 1, has_filters: false });
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    track("school_searched", { query_length: 3, results_count: 1, has_filters: false });
    await idle();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getConsent()).toBe("denied");
    unmount();
    render(<AnalyticsProvider />);
    await idle();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("Aceitar: libera o que aconteceu antes na mesma página e passa a enviar", async () => {
    enable();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AnalyticsProvider />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    track("school_searched", { query_length: 3, results_count: 1, has_filters: false });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/ingest/i/v0/e");
    expect(String(init.body)).toContain("school_searched");
    expect(String(init.body)).not.toContain("$identify");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("consentimento já dado: sem aviso e envia; revogar depois para tudo", async () => {
    enable();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    grant();
    render(<AnalyticsProvider />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    track("login_started", { method: "google" });
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => revoke());
    track("login_started", { method: "google" });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("identify depois do aceite usa o uuid, nunca e-mail ou telefone", async () => {
    enable();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    grant();
    render(<AnalyticsProvider />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    const { identify } = await import("@/lib/analytics/track");
    identify("mae@exemplo.com");
    identify("65999991234");
    identify("3f2b8c1e-5a4d-4e7b-9c0a-1d2e3f4a5b6c");
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const bodies = fetchMock.mock.calls.map((c) => String((c[1] as RequestInit).body)).join("\n");
    expect(bodies).toContain("$identify");
    expect(bodies).toContain("3f2b8c1e-5a4d-4e7b-9c0a-1d2e3f4a5b6c");
    expect(bodies).not.toMatch(/exemplo|65999991234/);
  });
});

describe("ConsentPreferences (página de privacidade)", () => {
  it("sem chave não renderiza nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { ConsentPreferences } = await import("@/components/analytics/ConsentPreferences");
    const { container } = render(<ConsentPreferences />);
    await idle();
    expect(container).toBeEmptyDOMElement();
  });

  it("com chave mostra a escolha e permite aceitar e retirar o aceite", async () => {
    enable();
    const { ConsentPreferences } = await import("@/components/analytics/ConsentPreferences");
    render(<ConsentPreferences />);
    await idle();
    expect(screen.getByText(/ainda não escolheu/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar medição" }));
    expect(screen.getByText("Medição de uso aceita.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirar o aceite" }));
    expect(screen.getByText(/recusada/i)).toBeInTheDocument();
    expect(localStorage.getItem("lc_analytics_id")).toBeNull();
    expect(getConsent()).toBe("denied");
  });
});

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
