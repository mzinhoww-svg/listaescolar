import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifyInputSchema } from "@/features/submissions/form-schema";

const ID = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";

describe("notifyInputSchema", () => {
  it("browser não guarda destino", () => {
    expect(notifyInputSchema.parse({ submissionId: ID, channel: "browser", target: "qualquer" })).toMatchObject({ channel: "browser", target: null });
  });
  it("e-mail válido é normalizado; inválido é recusado", () => {
    expect(notifyInputSchema.parse({ submissionId: ID, channel: "email", target: " Ana@Exemplo.com " }).target).toBe("ana@exemplo.com");
    expect(notifyInputSchema.safeParse({ submissionId: ID, channel: "email", target: "sem-arroba" }).success).toBe(false);
    expect(notifyInputSchema.safeParse({ submissionId: ID, channel: "email" }).success).toBe(false);
  });
  it("WhatsApp: E.164 com +55", () => {
    expect(notifyInputSchema.parse({ submissionId: ID, channel: "whatsapp", target: "(65) 99999-0000" }).target).toBe("+5565999990000");
    expect(notifyInputSchema.safeParse({ submissionId: ID, channel: "whatsapp", target: "123" }).success).toBe(false);
  });
  it("`none` e submissionId inválido são recusados", () => {
    expect(notifyInputSchema.safeParse({ submissionId: ID, channel: "none" }).success).toBe(false);
    expect(notifyInputSchema.safeParse({ submissionId: "x", channel: "browser" }).success).toBe(false);
  });
});

const getCurrentUser = vi.fn();
const rows = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ update: (v: unknown) => ({ eq: () => ({ select: async () => rows(v) }) }) }),
  }),
}));

import { setNotifyAction } from "@/app/enviar-lista/[submissionId]/actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("setNotifyAction", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    rows.mockReset();
    getCurrentUser.mockResolvedValue({ id: "u1" });
  });
  it("sem sessão: erro, nada gravado", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await setNotifyAction({ status: "idle" }, fd({ submissionId: ID, channel: "browser" }))).status).toBe("error");
    expect(rows).not.toHaveBeenCalled();
  });
  it("dono: grava canal e destino com o cliente do usuário", async () => {
    rows.mockResolvedValue({ data: [{ id: "j" }], error: null });
    const r = await setNotifyAction({ status: "idle" }, fd({ submissionId: ID, channel: "email", target: "a@b.co" }));
    expect(r).toEqual({ status: "saved", channel: "email" });
    expect(rows).toHaveBeenCalledWith({ notify_channel: "email", notify_target: "a@b.co" });
  });
  it("envio alheio (RLS não atualiza nenhuma linha): erro", async () => {
    rows.mockResolvedValue({ data: [], error: null });
    expect((await setNotifyAction({ status: "idle" }, fd({ submissionId: ID, channel: "browser" }))).status).toBe("error");
  });
});
