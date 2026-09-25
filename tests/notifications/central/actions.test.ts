import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: { userId: "00000000-0000-4000-8000-000000000001", role: "parent" } as { userId: string; role: string } | null }));
const log = vi.hoisted(() => ({ user: [] as unknown[][], admin: [] as unknown[][], rpc: [] as unknown[][], adminResult: { data: null as unknown, error: null as unknown } }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
const chain = (sink: unknown[][], result: () => unknown): unknown => {
  const b: unknown = new Proxy(function () {}, {
    get: (_t, p) => (p === "then" ? (r: (v: unknown) => unknown) => r(result()) : (...a: unknown[]) => { sink.push([String(p), ...a]); return b; }),
  });
  return b;
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => { log.user.push(["from", t]); return chain(log.user, () => ({ data: null, error: null })); } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: unknown) => { log.rpc.push([fn, args]); return Promise.resolve(log.adminResult); },
    from: () => chain(log.admin, () => ({ data: { id: "50000000-0000-4000-8000-0000000000c1" }, error: null })),
  }),
}));

import { markAllReadAction, markReadAction, savePreferenceAction, subscribePushAction, unsubscribePushAction, unwatchListAction, watchListAction } from "@/app/conta/notificacoes/actions";

const ID = "40000000-0000-4000-8000-0000000000a1";
const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const calls = (name: string) => log.user.filter((c) => c[0] === name);

beforeEach(() => {
  session.actor = { userId: "00000000-0000-4000-8000-000000000001", role: "parent" };
  log.user.length = log.admin.length = log.rpc.length = 0;
  log.adminResult = { data: null, error: null };
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "P".repeat(87));
  vi.stubEnv("APP_ENV", "production");
});

describe("todas as actions", () => {
  it("sem sessão: vai ao login e nada é lido nem gravado", async () => {
    session.actor = null;
    const all = [() => markReadAction(fd({ id: ID })), () => markAllReadAction(), () => savePreferenceAction({ event: "lead_received", channel: "web_push", enabled: true }), () => subscribePushAction(SUB), () => unsubscribePushAction({ endpoint: SUB.endpoint }), () => watchListAction({ inep: "51000001", gradeSlug: "ef-4", year: 2027 }), () => unwatchListAction({ inep: "51000001", gradeSlug: "ef-4", year: 2027 })];
    for (const a of all) await expect(a()).rejects.toThrow("REDIRECT:/entrar");
    expect(log.user).toEqual([]);
    expect(log.rpc).toEqual([]);
  });
});

describe("marcar como lida (só pela função do servidor, nunca UPDATE do cliente)", () => {
  it("usa notifications_mark_read com o perfil da sessão (o id do formulário é só o alvo); id inválido não chama o banco", async () => {
    await markReadAction(fd({ id: ID, recipient_id: "outro-perfil", profile_id: "outro" }));
    expect(log.rpc).toEqual([["notifications_mark_read", { p_profile_id: session.actor!.userId, p_ids: [ID] }]]);
    expect(log.user).toEqual([]);
    log.rpc.length = 0;
    await markReadAction(fd({ id: "x" }));
    expect(log.rpc).toEqual([]);
  });
  it("marcar todas: p_ids nulo, sempre do perfil da sessão", async () => {
    await markAllReadAction();
    expect(log.rpc).toEqual([["notifications_mark_read", { p_profile_id: session.actor!.userId, p_ids: null }]]);
  });
});

describe("preferência por evento e canal", () => {
  it("grava com profile_id da sessão (nunca do formulário)", async () => {
    expect(await savePreferenceAction({ event: "lead_received", channel: "web_push", enabled: true })).toEqual({ status: "ok" });
    const up = calls("upsert")[0]!;
    expect(up[1]).toEqual({ profile_id: session.actor!.userId, event_type: "lead_received", channel: "web_push", enabled: true });
  });
  it("Zod recusa campo extra/evento inválido; canal indisponível no ambiente é recusado", async () => {
    expect(await savePreferenceAction({ event: "lead_received", channel: "web_push", enabled: true, profile_id: "x" })).toMatchObject({ status: "error", code: "invalid" });
    expect(await savePreferenceAction({ event: "publication_orphaned", channel: "web_push", enabled: true })).toMatchObject({ status: "error", code: "invalid" });
    expect(await savePreferenceAction({ event: "lead_received", channel: "email", enabled: true })).toMatchObject({ status: "error", code: "channel_unavailable" });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(await savePreferenceAction({ event: "lead_received", channel: "web_push", enabled: true })).toMatchObject({ status: "error", code: "channel_unavailable" });
    expect(calls("upsert")).toHaveLength(0);
  });
  it("desligar sempre é permitido, mesmo com o canal indisponível", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(await savePreferenceAction({ event: "lead_received", channel: "web_push", enabled: false })).toEqual({ status: "ok" });
  });
});

describe("assinatura de push", () => {
  it("cria pelo servidor (função SQL) com o perfil da sessão", async () => {
    expect(await subscribePushAction(SUB)).toEqual({ status: "ok" });
    expect(log.rpc[0]).toEqual(["push_subscription_upsert", { p_profile_id: session.actor!.userId, p_endpoint: SUB.endpoint, p_p256dh: SUB.keys.p256dh, p_auth: SUB.keys.auth }]);
  });
  it("Zod recusa endpoint http/externo inválido em produção e campo extra; sem VAPID público: indisponível", async () => {
    expect(await subscribePushAction({ ...SUB, endpoint: "https://evil.example/x" })).toMatchObject({ status: "error", code: "invalid" });
    expect(await subscribePushAction({ ...SUB, endpoint: "http://127.0.0.1:9/x" })).toMatchObject({ status: "error", code: "invalid" });
    expect(await subscribePushAction({ ...SUB, profile_id: "x" })).toMatchObject({ status: "error", code: "invalid" });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(await subscribePushAction(SUB)).toMatchObject({ status: "error", code: "channel_unavailable" });
    expect(log.rpc).toEqual([]);
  });
  it("loopback http vale em local", async () => {
    vi.stubEnv("APP_ENV", "local");
    expect(await subscribePushAction({ ...SUB, endpoint: "http://127.0.0.1:9911/push" })).toEqual({ status: "ok" });
  });
  it("teto de 5 e endpoint de outro perfil viram códigos próprios", async () => {
    log.adminResult = { data: null, error: { code: "22023", hint: "subscription_limit" } };
    expect(await subscribePushAction(SUB)).toMatchObject({ status: "error", code: "limit" });
    log.adminResult = { data: null, error: { code: "22023", hint: "endpoint_owned" } };
    expect(await subscribePushAction(SUB)).toMatchObject({ status: "error", code: "endpoint_taken" });
    log.adminResult = { data: null, error: { message: "boom" } };
    expect(await subscribePushAction(SUB)).toMatchObject({ status: "error", code: "unavailable" });
  });
  it("cancelar remove só a inscrição do próprio perfil", async () => {
    expect(await unsubscribePushAction({ endpoint: SUB.endpoint })).toEqual({ status: "ok" });
    expect(calls("delete")).toHaveLength(1);
    expect(calls("eq")).toEqual(expect.arrayContaining([["eq", "profile_id", session.actor!.userId], ["eq", "endpoint", SUB.endpoint]]));
  });
});

describe("avise-me (list_watches)", () => {
  const input = { inep: "51000001", gradeSlug: "ef-4", year: 2027 };
  it("cria pela função com o perfil da sessão; exists também é ok; limite e inválido têm códigos próprios", async () => {
    log.adminResult = { data: "added", error: null };
    expect(await watchListAction(input)).toEqual({ status: "ok" });
    expect(log.rpc[0]).toEqual(["list_watch_add", { p_profile_id: session.actor!.userId, p_school_id: "50000000-0000-4000-8000-0000000000c1", p_grade_slug: "ef-4", p_year: 2027 }]);
    log.adminResult = { data: "exists", error: null };
    expect(await watchListAction(input)).toEqual({ status: "ok" });
    log.adminResult = { data: "limit", error: null };
    expect(await watchListAction(input)).toMatchObject({ status: "error", code: "limit" });
    expect(await watchListAction({ ...input, inep: "1" })).toMatchObject({ status: "error", code: "invalid" });
  });
  it("remover usa a função com o perfil da sessão", async () => {
    log.adminResult = { data: true, error: null };
    expect(await unwatchListAction(input)).toEqual({ status: "ok" });
    expect(log.rpc[0]![0]).toBe("list_watch_remove");
  });
});
