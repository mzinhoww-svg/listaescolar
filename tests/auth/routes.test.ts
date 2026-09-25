import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

import { GET as callback } from "@/app/auth/callback/route";
import { GET as confirm } from "@/app/auth/confirm/route";

function req(path: string) {
  // Host forjado: o Location tem de continuar relativo.
  return new NextRequest(`http://evil.test${path}`, { headers: { host: "evil.test" } });
}

describe("/auth/callback", () => {
  beforeEach(() => exchangeCodeForSession.mockReset());
  it("sucesso: Location relativo para next", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await callback(req("/auth/callback?code=abc&next=/conta"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/conta");
  });
  it("erro: Location relativo para /entrar?erro=codigo", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "x" } });
    const res = await callback(req("/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
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
  beforeEach(() => verifyOtp.mockReset());
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
    for (const q of ["token_hash=h&type=recovery", "type=email", "token_hash=h"]) {
      const res = await confirm(req(`/auth/confirm?${q}`));
      expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("erro do verifyOtp", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email"));
    expect(res.headers.get("location")).toBe("/entrar?erro=codigo");
  });
  it("next malicioso cai em /conta", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm(req("/auth/confirm?token_hash=h&type=email&next=https://evil.test"));
    expect(res.headers.get("location")).toBe("/conta");
  });
});
