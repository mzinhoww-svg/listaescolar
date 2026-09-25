import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp, signInWithOAuth } }),
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ origin: "http://evil.test", host: "evil.test", "x-forwarded-host": "evil.test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { signInWithGoogle, signInWithMagicLink } from "@/features/auth/actions";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("actions de login", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://listacerta.test");
    signInWithOtp.mockReset();
    signInWithOAuth.mockReset();
  });

  it("link mágico aponta para /auth/confirm na origem canônica, ignorando Host/Origin", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const r = await signInWithMagicLink(form({ email: "a@b.co", next: "/conta/x" }));
    expect(r.status).toBe("sent");
    expect(signInWithOtp.mock.calls[0]?.[0].options.emailRedirectTo).toBe(
      "https://listacerta.test/auth/confirm?next=%2Fconta%2Fx",
    );
  });
  it("Google continua em /auth/callback", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.test" },
      error: null,
    });
    await expect(signInWithGoogle(form({ next: "/conta" }))).rejects.toThrow(
      "REDIRECT:https://accounts.google.test",
    );
    expect(signInWithOAuth.mock.calls[0]?.[0].options.redirectTo).toBe(
      "https://listacerta.test/auth/callback?next=%2Fconta",
    );
  });
  it("rate limit (status 429) vira mensagem específica", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 429, code: "over_email_send_rate_limit" } });
    expect(await signInWithMagicLink(form({ email: "a@b.co" }))).toEqual({
      status: "error",
      message: "Aguarde um minuto para pedir outro link.",
    });
  });
  it("rate limit só pelo código também", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 400, code: "over_email_send_rate_limit" } });
    expect((await signInWithMagicLink(form({ email: "a@b.co" }))).message).toMatch(
      /Aguarde um minuto/,
    );
  });
  it("demais erros seguem genéricos", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 500, code: "unexpected_failure" } });
    expect((await signInWithMagicLink(form({ email: "a@b.co" }))).message).toBe(
      "Não foi possível continuar. Tente novamente.",
    );
  });
});
