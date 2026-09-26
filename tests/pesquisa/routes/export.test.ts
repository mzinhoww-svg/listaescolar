import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exportResponsesRows = vi.fn();
const exportLeadsRows = vi.fn();

vi.mock("@/lib/pesquisa/repositorio", () => ({
  exportResponsesRows: () => exportResponsesRows(),
  exportLeadsRows: () => exportLeadsRows(),
}));

let GET: typeof import("@/app/api/pesquisa/export/route").GET;
let signResultsCookie: typeof import("@/lib/pesquisa/auth-resultados").signResultsCookie;

const PASSWORD = "senha-de-teste-bem-forte";

function call(tipo: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `pesquisa_auth=${cookie}`;
  return GET(
    new Request(`http://localhost/api/pesquisa/export?tipo=${tipo}`, { headers }) as never,
  );
}

describe("GET /api/pesquisa/export", () => {
  beforeEach(async () => {
    exportResponsesRows.mockReset();
    exportLeadsRows.mockReset();
    exportResponsesRows.mockResolvedValue([
      {
        id: "1",
        session_id: "11111111-1111-4111-8111-111111111111",
        survey_version: "maes-2026-09",
        answers: { cidade: "cuiaba" },
        last_step: 12,
        source_group: "whatsapp",
        ref_session_id: null,
        ip_hash: null,
        user_agent: null,
        started_at: "2026-09-25T10:00:00.000Z",
        updated_at: "2026-09-25T10:05:00.000Z",
        completed_at: "2026-09-25T10:05:00.000Z",
      },
    ]);
    exportLeadsRows.mockResolvedValue([]);

    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("OPENROUTER_KEY", "or-test");
    vi.stubEnv("AI_MODEL_CHEAP", "modelo/barato");
    vi.stubEnv("AI_MODEL_STRONG", "modelo/forte");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("PESQUISA_RESULTS_PASSWORD", PASSWORD);
    vi.resetModules();
    ({ GET } = await import("@/app/api/pesquisa/export/route"));
    ({ signResultsCookie } = await import("@/lib/pesquisa/auth-resultados"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sem cookie: 401", async () => {
    const res = await call("respostas");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("tipo inválido: 400", async () => {
    const res = await call("outro", signResultsCookie(PASSWORD));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_tipo" });
  });

  it("cookie válido: 200 com CSV de respostas contendo o cabeçalho esperado", async () => {
    const res = await call("respostas", signResultsCookie(PASSWORD));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("pesquisa-respostas.csv");
    const body = await res.text();
    expect(body).toContain("cidade,filhos,rede,escola,etapas");
    expect(body).toContain("cuiaba");
  });

  it("cookie válido: 200 com CSV de leads", async () => {
    const res = await call("leads", signResultsCookie(PASSWORD));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("name,whatsapp_e164,consent_at,source_group");
  });
});
