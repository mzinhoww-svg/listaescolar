import { beforeEach, describe, expect, it, vi } from "vitest";

const markCompleted = vi.fn();

vi.mock("@/lib/pesquisa/repositorio", () => ({
  markCompleted: (...a: unknown[]) => markCompleted(...a),
}));

import { POST } from "@/app/api/pesquisa/concluir/route";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/pesquisa/concluir", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never,
  );
}

describe("POST /api/pesquisa/concluir", () => {
  beforeEach(() => {
    markCompleted.mockReset();
  });

  it("payload válido e pronto para concluir: 200", async () => {
    markCompleted.mockResolvedValue(true);
    const res = await call({ session_id: SESSION_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("payload inválido: 400", async () => {
    const res = await call({ session_id: "nao-uuid" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it("repositório retorna false: 409 not_ready", async () => {
    markCompleted.mockResolvedValue(false);
    const res = await call({ session_id: SESSION_ID });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_ready" });
  });
});
