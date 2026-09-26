import { beforeEach, describe, expect, it, vi } from "vitest";

const createOrUpdateLead = vi.fn();

vi.mock("@/lib/pesquisa/repositorio", () => ({
  createOrUpdateLead: (...a: unknown[]) => createOrUpdateLead(...a),
}));

import { POST } from "@/app/api/pesquisa/lead/route";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/pesquisa/lead", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never,
  );
}

describe("POST /api/pesquisa/lead", () => {
  beforeEach(() => {
    createOrUpdateLead.mockReset();
    createOrUpdateLead.mockResolvedValue("ok");
  });

  it("payload válido: 200 e grava com o texto exato do consentimento", async () => {
    const res = await call({
      session_id: SESSION_ID,
      whatsapp: "(65) 99999-1234",
      consent: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createOrUpdateLead).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      name: undefined,
      whatsappE164: "+5565999991234",
      consentText:
        "Aceito receber mensagens da ListaCerta pelo WhatsApp sobre a lista escolar. Posso cancelar quando quiser.",
    });
  });

  it("sem consent: 400 invalid_payload", async () => {
    const res = await call({ session_id: SESSION_ID, whatsapp: "(65) 99999-1234" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    expect(createOrUpdateLead).not.toHaveBeenCalled();
  });

  it("honeypot preenchido: 200 sem gravar", async () => {
    const res = await call({
      session_id: SESSION_ID,
      whatsapp: "(65) 99999-1234",
      consent: true,
      hp: "bot",
    });
    expect(res.status).toBe(200);
    expect(createOrUpdateLead).not.toHaveBeenCalled();
  });

  it("whatsapp inválido: 400 invalid_whatsapp", async () => {
    const res = await call({ session_id: SESSION_ID, whatsapp: "123", consent: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_whatsapp" });
    expect(createOrUpdateLead).not.toHaveBeenCalled();
  });

  it("sessão inexistente: 404 session_not_found", async () => {
    createOrUpdateLead.mockResolvedValue("session_not_found");
    const res = await call({ session_id: SESSION_ID, whatsapp: "(65) 99999-1234", consent: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "session_not_found" });
  });
});
