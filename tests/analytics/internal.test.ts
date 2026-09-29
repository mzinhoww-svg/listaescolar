// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
let session: { user: { id: string; email: string } | null; role: string | null };
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "lc_analytics_consent" && cookieValue ? { name: n, value: cookieValue } : undefined) }),
}));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => session.user,
  getCurrentRole: async () => session.role,
}));

import { isInternalAccount } from "@/lib/analytics/internal";
import { captureLogin, captureServer, captureUserAction, emitServer } from "@/lib/analytics/server";
import { capture } from "../../supabase/functions/_shared/analytics/capture";

describe("isInternalAccount (revisão M6)", () => {
  it("e-mail @listacerta.test, admin e system são internos; o resto, não", () => {
    expect(isInternalAccount({ email: "qa@listacerta.test" })).toBe(true);
    expect(isInternalAccount({ email: "QA@ListaCerta.TEST" })).toBe(true);
    expect(isInternalAccount({ email: "x@outra.com", role: "admin" })).toBe(true);
    expect(isInternalAccount({ role: "system" })).toBe(true);
    expect(isInternalAccount({ email: "mae@gmail.com", role: "parent" })).toBe(false);
    expect(isInternalAccount({ email: "listacerta.test@gmail.com", role: "stationery_member" })).toBe(false);
    expect(isInternalAccount({})).toBe(false);
  });
});

describe("capture: is_internal por conta, sem enviar e-mail", () => {
  const cfg = { key: "phc_x", host: "https://eu.i.posthog.com", appEnv: "production" as const };
  const run = async (opts: { isInternal?: boolean }) => {
    const f = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response("{}"));
    await capture(cfg, "stationery_registered", { municipality_ibge: "5103403", offers_pickup: true, offers_delivery: false }, { ...opts, fetchImpl: f });
    return JSON.parse(String(f.mock.calls[0]![1]!.body));
  };
  it("em produção é false por padrão e true quando a conta é interna", async () => {
    expect((await run({})).properties.is_internal).toBe(false);
    const b = await run({ isInternal: true });
    expect(b.properties.is_internal).toBe(true);
    expect(JSON.stringify(b)).not.toContain("@");
  });
});

describe("servidor: eventos saem com is_internal da sessão", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    cookieValue = "granted";
    session = { user: null, role: null };
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("APP_ENV", "production");
    fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const settle = () => new Promise((r) => setTimeout(r, 120));
  const sent = () => fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)));

  it("admin logado: emitServer e captureServer marcam is_internal=true em produção", async () => {
    session = { user: { id: "u1", email: "adm@empresa.com" }, role: "admin" };
    await emitServer("list_published", { grade_slug: "5-ano", school_year: 2026, origin: "auto", is_first_version: true });
    captureServer("stationery_registered", { municipality_ibge: "5103403", offers_pickup: true, offers_delivery: false });
    await settle();
    expect(sent().map((b) => b.properties.is_internal)).toEqual([true, true]);
    expect(JSON.stringify(sent())).not.toContain("adm@empresa.com");
  });

  it("e-mail @listacerta.test logado: interno; responsável comum: não; sem sessão: não", async () => {
    session = { user: { id: "u2", email: "qa@listacerta.test" }, role: "parent" };
    await captureUserAction("purchase_clicked", { canal: "carrinho", retailer_slug: "loja" });
    session = { user: { id: "u3", email: "mae@gmail.com" }, role: "parent" };
    await captureUserAction("purchase_clicked", { canal: "carrinho", retailer_slug: "loja" });
    session = { user: null, role: null };
    await emitServer("stationery_registered", { municipality_ibge: "5103403", offers_pickup: true, offers_delivery: false });
    await settle();
    expect(sent().map((b) => b.properties.is_internal)).toEqual([true, false, false]);
  });

  it("captureLogin usa a conta recém-autenticada (a sessão ainda não está nos cookies da requisição)", async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "admin" } }) }) }) }) };
    await captureLogin("google", supabase as never, { id: "u9", email: "adm@empresa.com" });
    await captureLogin("magic_link", supabase as never, { id: "u8", email: "qa@listacerta.test" });
    const parent = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "parent" } }) }) }) }) };
    await captureLogin("google", parent as never, { id: "u7", email: "mae@gmail.com" });
    await captureLogin("google", {} as never, { id: "u6", email: "mae@gmail.com" }); // sem `from`: não interno, não lança
    await settle();
    expect(sent().map((b) => b.properties.is_internal)).toEqual([true, true, false, false]);
  });

  it("falha ao ler a sessão nunca impede o evento nem lança", async () => {
    session = { get user(): never { throw new Error("fora de requisição"); } } as never;
    await emitServer("stationery_registered", { municipality_ibge: "5103403", offers_pickup: true, offers_delivery: false });
    await settle();
    expect(sent().map((b) => b.properties.is_internal)).toEqual([false]);
  });
});
