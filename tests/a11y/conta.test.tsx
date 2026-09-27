// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
const getSessionActor = vi.fn();
const unreadCount = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/notifications/queries", () => ({ unreadCount: (...a: unknown[]) => unreadCount(...a) }));

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
