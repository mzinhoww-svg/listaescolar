import { beforeEach, describe, expect, it, vi } from "vitest";

const runRetention = vi.fn();
vi.mock("@/features/privacy/retention", () => ({ runRetention: (...a: unknown[]) => runRetention(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ marker: "admin" }) }));

import { isAuthorizedCron } from "@/features/leads/cron-auth";
import { GET } from "@/app/api/cron/retention-purge/route";

const SECRET = "segredo-de-cron-com-mais-de-16-caracteres";
const req = (auth?: string) => new Request("https://x.example/api/cron/retention-purge", { headers: auth === undefined ? {} : { authorization: auth } });

beforeEach(() => {
  runRetention.mockReset();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/retention-purge", () => {
  it("sem segredo configurado: 503 e nada roda", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(runRetention).not.toHaveBeenCalled();
  });

  it("segredo configurado curto demais conta como não configurado (503)", async () => {
    process.env.CRON_SECRET = "curto";
    expect((await GET(req("Bearer curto"))).status).toBe(503);
  });

  it("sem cabeçalho ou com segredo errado: 401 sem eco, tempo constante (isAuthorizedCron)", async () => {
    process.env.CRON_SECRET = SECRET;
    for (const h of [undefined, "Bearer errado", "Bearer "]) {
      const res = await GET(req(h));
      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).not.toContain(SECRET);
    }
    expect(runRetention).not.toHaveBeenCalled();
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCron("Bearer errado", SECRET)).toBe(false);
  });

  it("segredo certo: chama runRetention e devolve os resultados por recurso", async () => {
    process.env.CRON_SECRET = SECRET;
    runRetention.mockResolvedValue([
      { resource: "claim_evidence", purged: 2, storageFailed: 0 },
      { resource: "claim_tokens", purged: 5, storageFailed: 0 },
    ]);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcomes: [
        { resource: "claim_evidence", purged: 2, storageFailed: 0 },
        { resource: "claim_tokens", purged: 5, storageFailed: 0 },
      ],
    });
    expect(runRetention).toHaveBeenCalledTimes(1);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("falha do job: 500 sem vazar detalhe", async () => {
    process.env.CRON_SECRET = SECRET;
    runRetention.mockRejectedValue(new Error("senha=abc conexão recusada"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req(`Bearer ${SECRET}`));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("senha");
  });
});
