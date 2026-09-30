// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({ signInWithMagicLink: vi.fn(), signInWithGoogle: vi.fn() }));

const getCurrentUser = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));

import EntrarPage from "@/app/entrar/page";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { PrivacyNote } from "@/components/auth/PrivacyNote";
import { backFromLogin, destinationLabel, loginErrorMessage, sessionEndedNotice } from "@/features/auth/login-context";

describe("AuthHeader · UX-041 (caminho de volta em /entrar)", () => {
  it("Voltar ao início quando o destino é privado", () => {
    render(<AuthHeader next="/conta" />);
    expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
  });

  it("quando o destino é uma lista da escola, o Voltar leva à lista (D-161 f)", () => {
    render(<AuthHeader next="/escolas/99001001/ef-5?ano=2027" />);
    const back = screen.getByRole("link", { name: "Voltar à lista" });
    expect(back).toHaveAttribute("href", "/escolas/99001001/ef-5?ano=2027");
  });

  it("o alvo tem 44 px", () => {
    render(<AuthHeader next="/conta" />);
    for (const a of screen.getAllByRole("link")) expect(a.className).toMatch(/min-h-11/);
  });
});

describe("backFromLogin", () => {
  it("lista publicada volta à lista; rota privada volta ao início", () => {
    expect(backFromLogin("/escolas/1/ef-5")).toEqual({ href: "/escolas/1/ef-5", label: "Voltar à lista" });
    expect(backFromLogin("/escolas/1")).toEqual({ href: "/escolas/1", label: "Voltar à escola" });
    expect(backFromLogin("/carrinho/novo?lista=x")).toEqual({ href: "/", label: "Voltar ao início" });
    expect(backFromLogin("/conta")).toEqual({ href: "/", label: "Voltar ao início" });
  });
});

describe("sessão que terminou · UX-043", () => {
  it("nomeia o destino", () => {
    expect(destinationLabel("/conta/alunos/novo")).toBe("a sua conta");
    expect(destinationLabel("/enviar-lista")).toBe("o envio da lista");
    expect(destinationLabel("/carrinho/abc")).toBe("o seu carrinho");
  });
  it("aviso diz que a sessão terminou e para onde a pessoa volta", () => {
    const t = sessionEndedNotice("/carrinho/abc");
    expect(t).toMatch(/Sua sessão terminou/);
    expect(t).toMatch(/o seu carrinho/);
  });
});

describe("mensagens de erro do login · UX-044 e UX-045", () => {
  it("link vencido explica como pedir outro", () => {
    expect(loginErrorMessage("codigo")).toMatch(/link/);
    expect(loginErrorMessage("codigo")).toMatch(/novo link|outro link/i);
  });
  it("falha do Google oferece o e-mail", () => {
    const m = loginErrorMessage("provedor");
    expect(m).toMatch(/Google/);
    expect(m).toMatch(/e-mail/);
  });
  it("código desconhecido cai em mensagem genérica", () => {
    expect(loginErrorMessage("xyz")).toMatch(/Tente de novo/);
  });
});

describe("Google e Termos · UX-047", () => {
  it("a nota do Google fica junto do botão do Google", () => {
    const { container } = render(<GoogleButton next="/conta" />);
    expect(container.textContent).toMatch(/só nome e e-mail da sua conta Google/);
  });

  it("PrivacyNote não repete a nota do Google e dá 44 px a Termos e Política", () => {
    const { container } = render(<PrivacyNote />);
    expect(container.textContent).not.toMatch(/conta Google/);
    for (const name of ["Termos", "Política de Privacidade"]) {
      const a = screen.getByRole("link", { name });
      expect(a.className).toContain("min-h-11");
      expect(a.className).toContain("inline-flex");
    }
  });
});

describe("/entrar · página", () => {
  const page = async (sp: Record<string, string>) => {
    getCurrentUser.mockResolvedValue(null);
    render(await EntrarPage({ searchParams: Promise.resolve(sp) } as never));
  };

  it("o logo leva ao início e há caminho de volta", async () => {
    await page({});
    expect(screen.getByRole("link", { name: /ListaCerta, ir para o início/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /^Voltar/ })).toBeInTheDocument();
  });

  it("sessao=terminou diz que a sessão terminou e para onde volta", async () => {
    await page({ sessao: "terminou", next: "/carrinho/abc" });
    expect(screen.getByRole("status")).toHaveTextContent(/Sua sessão terminou.*o seu carrinho/);
  });

  it("sem sessao=terminou não há aviso de sessão", async () => {
    await page({ next: "/carrinho/abc" });
    expect(screen.queryByText(/Sua sessão terminou/)).not.toBeInTheDocument();
  });

  it("erro=codigo com next mostra o texto de link vencido e mantém o destino no formulário", async () => {
    await page({ erro: "codigo", next: "/enviar-lista" });
    expect(screen.getByRole("alert")).toHaveTextContent(/link/);
    expect(document.querySelector('input[name="next"]')).toHaveValue("/enviar-lista");
  });
});
