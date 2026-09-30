import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const captureException = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

import { GET as callback } from "@/app/auth/callback/route";
import { GET as confirm } from "@/app/auth/confirm/route";

function req(path: string) {
  // Host forjado: o Location tem de continuar relativo.
  return new NextRequest(`http://evil.test${path}`, { headers: { host: "evil.test" } });
}

describe("/auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    captureException.mockReset();
  });
  it("sucesso: Location relativo para next", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await callback(req("/auth/callback?code=abc&next=/conta"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/conta");
    expect(captureException).not.toHaveBeenCalled();
  });
  it("erro: Location relativo para /entrar?erro=codigo", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "x" } });
    const res = await callback(req("/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
  });
  it("D-005/S19: erro do provedor no exchange é registrado no Sentry sem a mensagem crua", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "detalhe interno maria@x.com", status: 400 } });
    await callback(req("/auth/callback?code=abc"));
    expect(captureException).toHaveBeenCalledOnce();
    const err = captureException.mock.calls[0]![0] as Error;
    expect(err.message).not.toContain("maria@x.com");
    expect(err.message).toContain("400");
  });
  it("D-005/S19: exceção no exchange é registrada no Sentry", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("rede"));
    await callback(req("/auth/callback?code=abc"));
    expect(captureException).toHaveBeenCalledOnce();
  });
  it("erro do provedor", async () => {
    const res = await callback(req("/auth/callback?error=access_denied"));
    expect(res.headers.get("location")).toBe("/entrar?erro=provedor");
  });
  it("next malicioso cai em /conta", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await callback(req("/auth/callback?code=abc&next=//evil.test"));
    expect(res.headers.get("location")).toBe("/conta");
  });
});

describe("/auth/confirm", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    exchangeCodeForSession.mockReset();
    captureException.mockReset();
  });
  it("verifyOtp com token_hash e type; Location relativo", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email&next=/conta/x"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "email" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/conta/x");
  });
  it("aceita magiclink", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await confirm(req("/auth/confirm?token_hash=h&type=magiclink"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "magiclink" });
  });
  it("type inválido ou token ausente: /entrar?erro=codigo sem chamar verifyOtp", async () => {
    for (const q of ["token_hash=h&type=recovery", "type=email", "token_hash=h", ""]) {
      const res = await confirm(req(`/auth/confirm?${q}`));
      expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("aceita signup", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=signup"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "signup" });
    expect(res.headers.get("location")).toBe("/conta");
  });
  it("fallback: code sem token_hash usa exchangeCodeForSession", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await confirm(req("/auth/confirm?code=abc&next=/conta/y"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("/conta/y");
  });
  it("fallback: erro no exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "x" } });
    const res = await confirm(req("/auth/confirm?code=abc"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
  });
  it("token_hash tem prioridade sobre code", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await confirm(req("/auth/confirm?token_hash=h&type=email&code=abc"));
    expect(verifyOtp).toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("erro do verifyOtp", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
  });
  it("D-005/S19: erro do verifyOtp é registrado no Sentry sem a mensagem crua", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired maria@x.com", status: 401 } });
    await confirm(req("/auth/confirm?token_hash=h&type=email"));
    expect(captureException).toHaveBeenCalledOnce();
    const err = captureException.mock.calls[0]![0] as Error;
    expect(err.message).not.toContain("maria@x.com");
  });
  it("D-005/S19: exceção no verifyOtp é registrada no Sentry", async () => {
    verifyOtp.mockRejectedValue(new Error("rede"));
    await confirm(req("/auth/confirm?token_hash=h&type=email"));
    expect(captureException).toHaveBeenCalledOnce();
  });
  it("next malicioso cai em /conta", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email&next=https://evil.test"));
    expect(res.headers.get("location")).toBe("/conta");
  });
});

/** UX-044 (J3-06): link vencido ou usado não faz a pessoa perder o destino. */
describe("erro de link preserva o destino", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    exchangeCodeForSession.mockReset();
    captureException.mockReset();
  });
  it("/auth/confirm: link vencido volta a /entrar?erro=codigo&next=<destino>", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired", status: 401 } });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email&next=/enviar-lista%3Fserie%3Def-5"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo&next=%2Fenviar-lista%3Fserie%3Def-5");
  });
  it("/auth/confirm: parâmetros inválidos também guardam o destino", async () => {
    const res = await confirm(req("/auth/confirm?type=email&next=/conta/notificacoes"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo&next=%2Fconta%2Fnotificacoes");
  });
  it("/auth/confirm: destino externo não vira next do erro", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "x" } });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email&next=https://evil.test"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
  });
  it("/auth/callback: falha do Google guarda o destino", async () => {
    const res = await callback(req("/auth/callback?error=access_denied&next=/escolas/99001001/ef-5"));
    expect(res.headers.get("location")).toBe("/entrar?erro=provedor&next=%2Fescolas%2F99001001%2Fef-5");
  });
});
