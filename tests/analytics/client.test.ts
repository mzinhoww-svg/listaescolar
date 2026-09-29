import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAnalyticsConfig } from "@/lib/analytics/config";
import { createAnalyticsClient, type IdStore } from "@/lib/analytics/client";

const cfg = getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", APP_ENV: "staging" });
if (!cfg.enabled) throw new Error("config de teste deveria estar ligada");
const config = cfg;
const PROFILE = "3f2b8c1e-5a4d-4e7b-9c0a-1d2e3f4a5b6c";

type Sent = { url: string; body: Record<string, unknown>; init: RequestInit };

function setup(store?: IdStore) {
  const sent: Sent[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body)), init: init ?? {} });
    return new Response(null, { status: 200 });
  });
  const idStore: IdStore = store ?? { load: vi.fn(() => null), save: vi.fn(), clear: vi.fn() };
  let n = 0;
  const client = createAnalyticsClient({
    config,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    idStore,
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  return { client, sent, fetchImpl, idStore };
}

const events = (s: Sent[]) =>
  s.flatMap((x) => (Array.isArray(x.body.batch) ? (x.body.batch as Record<string, unknown>[]) : [x.body]));

describe("cliente de eventos", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("antes da escolha: nada é enviado, nada toca storage, sem identify; eventos ficam só em memória", async () => {
    const spies = [vi.spyOn(Storage.prototype, "getItem"), vi.spyOn(Storage.prototype, "setItem"), vi.spyOn(Storage.prototype, "removeItem")];
    const cookie = vi.spyOn(document, "cookie", "set");
    const { client, fetchImpl, idStore } = setup();
    client.track("school_searched", { query_length: 4, results_count: 2, has_filters: false });
    client.identify(PROFILE);
    client.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(idStore.load).not.toHaveBeenCalled();
    expect(idStore.save).not.toHaveBeenCalled();
    expect(client.state().consent).toBe("unset");
    expect(client.state().queued).toBe(1);
    vi.restoreAllMocks();
  });

  it("consentimento negado: zero requisições e fila vazia, inclusive para eventos seguintes", async () => {
    const { client, fetchImpl } = setup();
    client.track("school_searched", { query_length: 4, results_count: 2, has_filters: false });
    client.setConsent("denied");
    expect(client.state().queued).toBe(0);
    client.track("school_searched", { query_length: 4, results_count: 2, has_filters: false });
    client.identify(PROFILE);
    client.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.state().queued).toBe(0);
  });

  it("grant na mesma página libera a fila; corpo tem o token, sem person profile e sem chaves fora do esquema", async () => {
    const { client, sent, idStore } = setup();
    client.track("school_searched", { query_length: 4, results_count: 2, has_filters: false, query: "escola maria" } as never);
    client.setConsent("granted");
    await vi.advanceTimersByTimeAsync(0);
    const ev = events(sent);
    expect(ev).toHaveLength(1);
    expect(sent[0]!.url).toBe("/ingest/i/v0/e");
    expect(ev[0]!).toMatchObject({ api_key: "phc_test", event: "school_searched" });
    const props = ev[0]!.properties as Record<string, unknown>;
    expect(props).toMatchObject({ query_length: 4, app_env: "staging", is_internal: true, $process_person_profile: false });
    expect(props).not.toHaveProperty("query");
    expect(JSON.stringify(sent[0]!.body)).not.toMatch(/escola maria/);
    expect(sent[0]!.init.credentials).toBe("omit");
    expect(idStore.save).toHaveBeenCalledTimes(1);
  });

  it("reaproveita o id guardado depois do aceite", async () => {
    const stored = "11111111-1111-4111-8111-111111111111";
    const { client, sent } = setup({ load: () => stored, save: vi.fn(), clear: vi.fn() });
    client.setConsent("granted");
    client.track("login_started", { method: "google" });
    client.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(events(sent)[0]!.distinct_id).toBe(stored);
  });

  it("identify só com uuid, só depois do aceite, e nunca e-mail ou telefone", async () => {
    const { client, sent } = setup();
    client.identify(PROFILE); // antes do aceite: fica pendente, em memória
    client.setConsent("granted");
    client.identify("mae@exemplo.com");
    client.identify("(65) 99999-1234");
    client.identify("65999991234");
    await vi.advanceTimersByTimeAsync(0);
    const ev = events(sent);
    const identify = ev.filter((e) => e.event === "$identify");
    expect(identify).toHaveLength(1);
    expect(identify[0]!.distinct_id).toBe(PROFILE);
    expect(JSON.stringify(sent)).not.toMatch(/exemplo\.com|99999|65999991234/);
    client.track("login_completed", { method: "google" });
    client.flush();
    await vi.advanceTimersByTimeAsync(0);
    const last = events(sent).at(-1);
    expect(last).toMatchObject({ event: "login_completed", distinct_id: PROFILE });
    expect((last?.properties as Record<string, unknown>).$process_person_profile).not.toBe(false);
  });

  it("revoke esvazia a fila sem enviar, limpa o id e para o envio", async () => {
    const { client, fetchImpl, idStore } = setup();
    client.setConsent("granted");
    client.track("login_started", { method: "google" });
    client.setConsent("denied");
    client.revoke();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.state().queued).toBe(0);
    expect(idStore.clear).toHaveBeenCalled();
    client.track("login_started", { method: "google" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lote: 10 eventos saem juntos na hora; menos de 10 esperam 5 s", async () => {
    const { client, sent } = setup();
    client.setConsent("granted");
    for (let i = 0; i < 3; i++) client.track("login_started", { method: "google" });
    await vi.advanceTimersByTimeAsync(4_900);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("/ingest/batch");
    expect(events(sent)).toHaveLength(3);
    for (let i = 0; i < 10; i++) client.track("login_started", { method: "google" });
    await vi.advanceTimersByTimeAsync(0);
    expect(events(sent)).toHaveLength(13);
  });

  it("evento inválido ou com PII é descartado sem enviar", async () => {
    const { client, sent } = setup();
    client.setConsent("granted");
    client.track("landing_viewed", { path: "/", utm_source: "mae@exemplo.com" });
    client.track("school_searched", { query_length: "x" } as never);
    client.track("nao_existe" as never, {});
    client.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toHaveLength(0);
  });

  it("falha de rede não lança e não trava a fila", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const client = createAnalyticsClient({ config, fetchImpl: fetchImpl as unknown as typeof fetch, idStore: { load: () => null, save: vi.fn(), clear: vi.fn() } });
    client.setConsent("granted");
    client.track("login_started", { method: "google" });
    client.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalled();
    expect(client.state().queued).toBe(0);
  });

  it("fila antes da escolha é limitada (descarta o mais antigo)", () => {
    const { client } = setup();
    for (let i = 0; i < 80; i++) client.track("login_started", { method: "google" });
    expect(client.state().queued).toBe(50);
  });
});
