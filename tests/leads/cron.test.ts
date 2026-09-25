import { beforeEach, describe, expect, it, vi } from "vitest";

const expireDue = vi.fn();
vi.mock("@/features/leads/repository", () => ({ expireDue: (...a: unknown[]) => expireDue(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ marker: "admin" }) }));

import { isAuthorizedCron } from "@/features/leads/cron-auth";
import { GET } from "@/app/api/cron/leads-expire/route";

const SECRET = "segredo-de-cron-com-mais-de-16-caracteres";
const req = (auth?: string) => new Request("https://x.example/api/cron/leads-expire", { headers: auth === undefined ? {} : { authorization: auth } });

beforeEach(() => {
  expireDue.mockReset();
  delete process.env.CRON_SECRET;
});

describe("isAuthorizedCron", () => {
  it("só aceita Bearer igual ao segredo", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    for (const h of [null, "", "Bearer", "Bearer ", `bearer ${SECRET}`, SECRET, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, `Basic ${SECRET}`, "Bearer outro"]) {
      expect(isAuthorizedCron(h, SECRET)).toBe(false);
    }
    expect(isAuthorizedCron(`Bearer ${SECRET}`, "")).toBe(false);
    expect(isAuthorizedCron(`Bearer `, "")).toBe(false);
  });
});

describe("GET /api/cron/leads-expire", () => {
  it("sem segredo configurado: 503 e nada roda", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(expireDue).not.toHaveBeenCalled();
  });

  it("segredo configurado curto demais conta como não configurado (503)", async () => {
    process.env.CRON_SECRET = "curto";
    expect((await GET(req("Bearer curto"))).status).toBe(503);
  });

  it("sem cabeçalho ou com segredo errado: 401 sem eco", async () => {
    process.env.CRON_SECRET = SECRET;
    for (const h of [undefined, "Bearer errado", "Bearer "]) {
      const res = await GET(req(h));
      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain("errado");
    }
    expect(expireDue).not.toHaveBeenCalled();
  });

  it("segredo certo: chama expireDue e devolve a contagem", async () => {
    process.env.CRON_SECRET = SECRET;
    expireDue.mockResolvedValue(3);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expired: 3 });
    expect(expireDue).toHaveBeenCalledTimes(1);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("falha do banco: 500 sem vazar detalhe", async () => {
    process.env.CRON_SECRET = SECRET;
    expireDue.mockRejectedValue(new Error("senha=abc conexão recusada"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req(`Bearer ${SECRET}`));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("senha");
  });
});
