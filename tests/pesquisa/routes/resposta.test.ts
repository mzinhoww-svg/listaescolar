import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionExists = vi.fn();
const countNewSessionsForIpHash = vi.fn();
const upsertAnswer = vi.fn();

vi.mock("@/lib/pesquisa/repositorio", () => ({
  sessionExists: (...a: unknown[]) => sessionExists(...a),
  countNewSessionsForIpHash: (...a: unknown[]) => countNewSessionsForIpHash(...a),
  upsertAnswer: (...a: unknown[]) => upsertAnswer(...a),
}));

import { POST } from "@/app/api/pesquisa/resposta/route";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function call(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/pesquisa/resposta", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    }) as never,
  );
}

describe("POST /api/pesquisa/resposta", () => {
  beforeEach(() => {
    for (const m of [sessionExists, countNewSessionsForIpHash, upsertAnswer]) m.mockReset();
    sessionExists.mockResolvedValue(false);
    countNewSessionsForIpHash.mockResolvedValue(0);
    upsertAnswer.mockResolvedValue(undefined);
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("OPENROUTER_KEY", "or-test");
    vi.stubEnv("AI_MODEL_CHEAP", "modelo/barato");
    vi.stubEnv("AI_MODEL_STRONG", "modelo/forte");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("IP_HASH_SALT", "0123456789abcdef0123456789abcdef");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("payload válido: 200 e grava", async () => {
    const res = await call({ session_id: SESSION_ID, step: 1, answers: { cidade: "cuiaba" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertAnswer).toHaveBeenCalledTimes(1);
  });

  it("payload inválido (envelope): 400", async () => {
    const res = await call({ session_id: "nao-uuid", step: 1, answers: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    expect(upsertAnswer).not.toHaveBeenCalled();
  });

  it("honeypot preenchido: 200 sem gravar nem checar sessão", async () => {
    const res = await call({
      session_id: SESSION_ID,
      step: 1,
      answers: { cidade: "cuiaba" },
      hp: "bot",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sessionExists).not.toHaveBeenCalled();
    expect(upsertAnswer).not.toHaveBeenCalled();
  });

  it("answers de outra tela: 400 invalid_answers", async () => {
    const res = await call({ session_id: SESSION_ID, step: 1, answers: { filhos: "1" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_answers" });
    expect(upsertAnswer).not.toHaveBeenCalled();
  });

  it("sessão nova e 30+ sessões recentes pelo mesmo ip_hash: 429", async () => {
    countNewSessionsForIpHash.mockResolvedValue(30);
    const res = await call(
      { session_id: SESSION_ID, step: 1, answers: { cidade: "cuiaba" } },
      { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(upsertAnswer).not.toHaveBeenCalled();
  });

  it("sessão já existente: não aplica rate limit mesmo com contagem alta", async () => {
    sessionExists.mockResolvedValue(true);
    countNewSessionsForIpHash.mockResolvedValue(999);
    const res = await call({ session_id: SESSION_ID, step: 1, answers: { cidade: "cuiaba" } });
    expect(res.status).toBe(200);
    expect(upsertAnswer).toHaveBeenCalledTimes(1);
  });
});
