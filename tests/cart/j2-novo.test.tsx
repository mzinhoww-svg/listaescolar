// S29 T12 · UX-037 e UX-040: `/carrinho/novo` (vazio com caminho; título e botão com o mesmo nome) e a criação direta a partir da lista.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn(async () => ({ user: { id: "u" }, role: "parent" })) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => ({ userId: "u", role: "parent" }) }));
const getList = vi.fn();
vi.mock("@/features/cart/service", () => ({ getListReader: () => ({ getList: (...a: unknown[]) => getList(...a) }), readServiceEnv: () => ({}) }));
vi.mock("@/app/carrinho/novo/actions", () => ({ createCartAction: vi.fn() }));

import NovoCarrinhoPage from "@/app/carrinho/novo/page";

const LIST = "66666666-6666-4666-8666-666666666666";
const page = async (sp: Record<string, string>) => render(await NovoCarrinhoPage({ searchParams: Promise.resolve(sp) } as never));

beforeEach(() => getList.mockReset());

describe("/carrinho/novo", () => {
  it("sem lista: leva a 'Buscar escola' e 'Meus carrinhos'", async () => {
    await page({});
    expect(screen.getByRole("link", { name: "Buscar escola" })).toHaveAttribute("href", "/escolas");
    expect(screen.getByRole("link", { name: "Meus carrinhos" })).toHaveAttribute("href", "/conta/carrinhos");
  });

  it("título e botão nomeiam a mesma ação", async () => {
    getList.mockResolvedValue({ kind: "official", isDemo: false, items: [{ id: "i", name: "Caderno", quantity: 2 }] });
    await page({ lista: LIST });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Comparar opções de compra para 1 item");
    expect(screen.getByRole("button", { name: "Comparar opções" })).toBeInTheDocument();
  });
});
