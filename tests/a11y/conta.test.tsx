// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
const getSessionActor = vi.fn();
const unreadCount = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/notifications/queries", () => ({ unreadCount: (...a: unknown[]) => unreadCount(...a) }));
const pathname = vi.fn(() => "/conta");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

requireAccess.mockResolvedValue(undefined);
getSessionActor.mockResolvedValue(null);
unreadCount.mockResolvedValue(0);

import Layout from "@/app/conta/layout";

/**
 * Correção da revisão da S18: a área da família (`app/conta`) não tinha `ContaShell` (o plano citava um por
 * engano) — o skip-link entra no `layout.tsx` compartilhado e o `id="conteudo"` em cada `<main>` das 8 páginas
 * sob `/conta` (cada página já tinha o próprio `<main>`; nenhum foi duplicado).
 */
describe("app/conta/layout.tsx (skip-link)", () => {
  it("tem skip-link apontando para #conteudo, antes do conteúdo", async () => {
    render(await Layout({ children: <p>conteúdo da página</p> }));
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
  });
});

describe("app/conta/layout.tsx (cabeçalho) · UX-049", () => {
  it("logo clicável para o início e sino que leva à central", async () => {
    pathname.mockReturnValue("/conta");
    render(await Layout({ children: <p>x</p> }));
    expect(screen.getByRole("link", { name: /ListaCerta, ir para o início/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Notificações/ })).toHaveAttribute("href", "/conta/notificacoes");
  });

  it("dentro da central o sino não é link para si mesmo: aponta para a lista de avisos da própria página", async () => {
    pathname.mockReturnValue("/conta/notificacoes");
    render(await Layout({ children: <p>x</p> }));
    const bell = screen.getByRole("link", { name: /Notificações/ });
    expect(bell).toHaveAttribute("href", "#central");
    expect(bell).toHaveAttribute("aria-current", "page");
  });
});
