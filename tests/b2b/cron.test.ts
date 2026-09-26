import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { GET } from "@/app/api/cron/b2b-maintenance/route";

const SECRET = "segredo-de-cron-com-mais-de-16-caracteres";
const req = (auth?: string) => new Request("https://x.example/api/cron/b2b-maintenance", { headers: auth === undefined ? {} : { authorization: auth } });

beforeEach(() => {
  rpc.mockReset();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/b2b-maintenance", () => {
  it("sem CRON_SECRET configurado: 503 e nada roda", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("segredo curto demais conta como não configurado (503)", async () => {
    process.env.CRON_SECRET = "curto";
    expect((await GET(req("Bearer curto"))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem cabeçalho ou com segredo errado: 401, sem chamar o banco", async () => {
    process.env.CRON_SECRET = SECRET;
    for (const h of [undefined, "Bearer errado", "Bearer "]) {
      const res = await GET(req(h));
      expect(res.status).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("segredo certo: chama b2b_prune_rate_windows e devolve a contagem", async () => {
    process.env.CRON_SECRET = SECRET;
    rpc.mockResolvedValue({ data: 7, error: null });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pruned: 7 });
    expect(rpc).toHaveBeenCalledWith("b2b_prune_rate_windows", {});
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("falha do banco: 500 sem vazar detalhe", async () => {
    process.env.CRON_SECRET = SECRET;
    rpc.mockResolvedValue({ data: null, error: new Error("relation b2b_rate_windows não existe (detalhe interno)") });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req(`Bearer ${SECRET}`));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("relation");
  });
});
