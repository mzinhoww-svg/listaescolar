import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/pesquisa/login", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never,
  );
}

let POST: typeof import("@/app/api/pesquisa/login/route").POST;

describe("POST /api/pesquisa/login", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("OPENROUTER_KEY", "or-test");
    vi.stubEnv("AI_MODEL_CHEAP", "modelo/barato");
    vi.stubEnv("AI_MODEL_STRONG", "modelo/forte");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("PESQUISA_RESULTS_PASSWORD", "senha-de-teste-bem-forte");
    vi.resetModules();
    ({ POST } = await import("@/app/api/pesquisa/login/route"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("senha certa: 200 com cookie de resultados", async () => {
    const res = await call({ senha: "senha-de-teste-bem-forte" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("pesquisa_auth=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("senha errada: 401 invalid_password", async () => {
    const res = await call({ senha: "senha-errada" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_password" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("payload inválido (senha vazia): 400", async () => {
    const res = await call({ senha: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
  });
});
