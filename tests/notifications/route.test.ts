import { beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => ({ expire: vi.fn(async () => 2), dispatch: vi.fn(async () => ({ claimed: 1, sent: 1, failed: 0, skipped: 0 })), purge: vi.fn(async () => 3) }));
vi.mock("@/features/notifications/service", () => ({ runNotificationCycle: async () => ({ expiredTokens: await run.expire(), dispatch: await run.dispatch(), purged: await run.purge() }) }));

import { GET, POST } from "@/app/api/notifications/dispatch/route";

const SECRET = "segredo-de-teste-com-mais-de-16";
const req = (method: "GET" | "POST", auth?: string) => new Request("http://localhost/api/notifications/dispatch", { method, headers: auth ? { authorization: auth } : {} });

describe("/api/notifications/dispatch", () => {
  beforeEach(() => { vi.stubEnv("NOTIFICATIONS_DISPATCH_SECRET", SECRET); Object.values(run).forEach((f) => f.mockClear()); });
  it("sem segredo configurado: 503 e nada roda", async () => {
    vi.stubEnv("NOTIFICATIONS_DISPATCH_SECRET", "");
    expect((await POST(req("POST", `Bearer ${SECRET}`))).status).toBe(503);
    expect(run.dispatch).not.toHaveBeenCalled();
  });
  it("sem cabeçalho ou errado: 401", async () => {
    for (const a of [undefined, "Bearer errado", `Basic ${SECRET}`, `Bearer ${SECRET}x`]) expect((await POST(req("POST", a))).status, String(a)).toBe(401);
    expect(run.dispatch).not.toHaveBeenCalled();
  });
  it("certo: POST e GET (cron da Vercel) rodam expiração de tokens, despacho e limpeza", async () => {
    for (const m of [POST, GET]) {
      const res = await m(req(m === POST ? "POST" : "GET", `Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ expiredTokens: 2, dispatch: { claimed: 1, sent: 1, failed: 0, skipped: 0 }, purged: 3 });
    }
    expect(run.expire).toHaveBeenCalledTimes(2);
  });
  it("falha interna: 500 com código fixo, sem vazar detalhe", async () => {
    run.dispatch.mockRejectedValueOnce(new Error("senha=abc postgres://x"));
    const res = await POST(req("POST", `Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "dispatch_failed" });
  });
});
