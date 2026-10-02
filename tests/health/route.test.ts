import { beforeEach, describe, expect, it, vi } from "vitest";

const runHealthCheck = vi.fn();
vi.mock("@/features/health/service", () => ({ runHealthCheck: (...a: unknown[]) => runHealthCheck(...a) }));

import { GET } from "@/app/api/cron/health-check/route";

const SECRET = "segredo-de-cron-com-mais-de-16-caracteres";
const req = (auth?: string) => new Request("https://x.example/api/cron/health-check", { headers: auth === undefined ? {} : { authorization: auth } });

beforeEach(() => {
  runHealthCheck.mockReset();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/health-check", () => {
  it("sem segredo configurado: 503 e nada roda", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(runHealthCheck).not.toHaveBeenCalled();
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
    expect(runHealthCheck).not.toHaveBeenCalled();
  });

  it("segredo certo: chama runHealthCheck e devolve o resultado", async () => {
    process.env.CRON_SECRET = SECRET;
    const result = { deadJobs: { count: 0, alerted: false }, aiErrorRate: { total: 10, failed: 1, alerted: false } };
    runHealthCheck.mockResolvedValue(result);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(runHealthCheck).toHaveBeenCalledTimes(1);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("falha: 500 sem vazar detalhe", async () => {
    process.env.CRON_SECRET = SECRET;
    runHealthCheck.mockRejectedValue(new Error("senha=abc conexão recusada"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req(`Bearer ${SECRET}`));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("senha");
  });
});
