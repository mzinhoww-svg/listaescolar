// Server Actions de /conta/privacidade (S17 + correções da revisão de segurança/privacidade): reautenticação
// recente para excluir conta, mensagens específicas por vínculo bloqueante, e recusa de revogar consentimento
// contratual mesmo com um id forjado no formulário (defesa em profundidade — a tela já não mostra o botão).
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: { userId: "00000000-0000-4000-8000-000000000001", role: "parent" } as { userId: string; role: string } | null }));
const state = vi.hoisted(() => ({
  currentUser: null as { last_sign_in_at?: string | null } | null,
  deleteAccountImpl: async () => undefined as unknown,
  consentPurpose: "list_upload" as string | null,
}));
const revokeMyConsent = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: async () => state.currentUser }));
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/features/privacy/repository", () => ({ deleteAccount: (...a: unknown[]) => state.deleteAccountImpl(...(a as [])) }));
vi.mock("@/features/privacy/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/privacy/queries")>();
  return { ...actual, revokeMyConsent };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ marker: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.consentPurpose ? { purpose: state.consentPurpose } : null }),
        }),
      }),
    }),
  }),
}));

import { deleteAccountAction, revokeConsentAction } from "@/app/conta/privacidade/actions";
import { PrivacyError } from "@/features/privacy/errors";

const CONSENT_ID = "00000000-0000-4000-8000-0000000000c1";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  session.actor = { userId: "00000000-0000-4000-8000-000000000001", role: "parent" };
  state.currentUser = { last_sign_in_at: new Date().toISOString() };
  state.deleteAccountImpl = async () => undefined;
  state.consentPurpose = "list_upload";
  revokeMyConsent.mockClear();
});

describe("deleteAccountAction: reautenticação recente", () => {
  it("sessão recente + confirmação certa: exclui e sai", async () => {
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "excluir" }));
    expect(r.status).toBe("ok");
  });

  it("sem last_sign_in_at: recusa antes de tentar excluir", async () => {
    state.currentUser = {};
    const deleteSpy = vi.fn(async () => undefined);
    state.deleteAccountImpl = deleteSpy;
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "excluir" }));
    expect(r.status).toBe("error");
    expect((r as { message: string }).message).toMatch(/sessão precisa ser recente/i);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("login há mais de 15 minutos: recusa", async () => {
    state.currentUser = { last_sign_in_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() };
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "excluir" }));
    expect(r.status).toBe("error");
    expect((r as { message: string }).message).toMatch(/sessão precisa ser recente/i);
  });

  it("login há 10 minutos: aceita (dentro da janela)", async () => {
    state.currentUser = { last_sign_in_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "excluir" }));
    expect(r.status).toBe("ok");
  });

  it("confirmação errada: recusa antes mesmo de checar a sessão", async () => {
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "sim" }));
    expect(r.status).toBe("error");
  });
});

describe("deleteAccountAction: mensagens por vínculo bloqueante", () => {
  it.each([
    ["stationery_owner", /cadastro de papelaria/i],
    ["b2b_partner_owner", /parceiro do portal B2B/i],
    ["review_history", /fale com o suporte/i],
  ] as const)("%s -> mensagem específica, nunca erro genérico", async (code, re) => {
    state.deleteAccountImpl = async () => {
      throw new PrivacyError("bloqueado", code);
    };
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "excluir" }));
    expect(r.status).toBe("error");
    expect((r as { message: string }).message).toMatch(re);
  });

  it("erro desconhecido: mensagem genérica de tentar de novo, sem vazar detalhe interno", async () => {
    state.deleteAccountImpl = async () => {
      throw new Error("senha=abc conexão recusada");
    };
    const r = await deleteAccountAction({ status: "ok" }, fd({ confirmation: "excluir" }));
    expect(r.status).toBe("error");
    expect((r as { message: string }).message).not.toContain("senha");
  });
});

describe("revokeConsentAction: só finalidade revogável", () => {
  it("list_upload: revoga", async () => {
    state.consentPurpose = "list_upload";
    await revokeConsentAction(fd({ id: CONSENT_ID }));
    expect(revokeMyConsent).toHaveBeenCalledTimes(1);
  });

  it.each(["billing_terms", "b2b_api_terms"])("%s: recusa mesmo com id real (defesa em profundidade)", async (purpose) => {
    state.consentPurpose = purpose;
    await revokeConsentAction(fd({ id: CONSENT_ID }));
    expect(revokeMyConsent).not.toHaveBeenCalled();
  });

  it("consentimento inexistente: recusa sem lançar", async () => {
    state.consentPurpose = null;
    await expect(revokeConsentAction(fd({ id: CONSENT_ID }))).resolves.toBeUndefined();
    expect(revokeMyConsent).not.toHaveBeenCalled();
  });
});
