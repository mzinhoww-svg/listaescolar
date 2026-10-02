import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "9.9.9.9" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { verifyEmailCode } from "@/features/auth/actions";
import { codeSchema, verifyCodeInputSchema } from "@/features/auth/schemas";
import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("codeSchema", () => {
  it("aceita 6 dígitos e remove espaços (código colado com espaço)", () => {
    expect(codeSchema.parse("123456")).toBe("123456");
    expect(codeSchema.parse(" 123 456 ")).toBe("123456");
  });
  it.each(["12345", "1234567", "abcdef", "12345a", "", "12-456"])("recusa %j", (bad) => {
    expect(codeSchema.safeParse(bad).success).toBe(false);
  });
  it("input completo normaliza e-mail e protege o next", () => {
    const r = verifyCodeInputSchema.parse({
      email: " A@B.co ",
      code: "123456",
      next: "//evil.test",
    });
    expect(r.email).toBe("a@b.co");
    expect(r.next).toBe("/conta");
  });
});

describe("verifyEmailCode", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    __resetRateLimitForTests();
  });

  it("chama verifyOtp type email e redireciona ao next", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await expect(
      verifyEmailCode(form({ email: "A@b.co", code: "123 456", next: "/conta/x" })),
    ).rejects.toThrow("REDIRECT:/conta/x");
    expect(verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "email" });
  });
  it("código malformado: erro de campo, sem chamar o Supabase", async () => {
    const r = await verifyEmailCode(form({ email: "a@b.co", code: "12" }));
    expect(r).toMatchObject({ status: "error", invalid: true, email: "a@b.co" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("código errado/expirado: mensagem única, não revela se o e-mail existe", async () => {
    verifyOtp.mockResolvedValue({ error: { status: 403, code: "otp_expired" } });
    const a = await verifyEmailCode(form({ email: "existe@b.co", code: "111111" }));
    verifyOtp.mockResolvedValue({ error: { status: 400, code: "user_not_found" } });
    const b = await verifyEmailCode(form({ email: "naoexiste@b.co", code: "111111" }));
    expect(a.message).toBe("Código inválido ou expirado. Peça um novo código.");
    expect(b.message).toBe(a.message);
  });
  it("429 do Supabase vira pedido de espera", async () => {
    verifyOtp.mockResolvedValue({ error: { status: 429, code: "over_request_rate_limit" } });
    const r = await verifyEmailCode(form({ email: "a@b.co", code: "111111" }));
    expect(r.message).toBe("Muitas tentativas. Aguarde um minuto e tente de novo.");
  });
  it("rate limit local: após 8 tentativas recusa sem chamar o Supabase", async () => {
    verifyOtp.mockResolvedValue({ error: { status: 403, code: "otp_expired" } });
    for (let i = 0; i < 8; i++) await verifyEmailCode(form({ email: "a@b.co", code: "111111" }));
    verifyOtp.mockClear();
    const r = await verifyEmailCode(form({ email: "a@b.co", code: "222222" }));
    expect(r.message).toBe("Muitas tentativas. Aguarde um minuto e tente de novo.");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("exceção de rede vira erro genérico", async () => {
    verifyOtp.mockRejectedValue(new Error("rede"));
    const r = await verifyEmailCode(form({ email: "a@b.co", code: "111111" }));
    expect(r).toMatchObject({
      status: "error",
      message: "Não foi possível continuar. Tente novamente.",
    });
  });
});
