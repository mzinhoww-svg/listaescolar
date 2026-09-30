// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
const getSessionActor = vi.fn();
const listMyStudents = vi.fn();
const listMySavedLists = vi.fn();
const listCartsForOwner = vi.fn();
const loadCartLabels = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/students/queries", () => ({ listMyStudents: (...a: unknown[]) => listMyStudents(...a) }));
vi.mock("@/features/saved-lists/queries", () => ({ listMySavedLists: (...a: unknown[]) => listMySavedLists(...a) }));
vi.mock("@/features/cart/repository", () => ({ listCartsForOwner: (...a: unknown[]) => listCartsForOwner(...a) }));
vi.mock("@/features/cart/labels", () => ({ loadCartLabels: (...a: unknown[]) => loadCartLabels(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/components/auth/sign-out-action", () => ({ signOutAction: vi.fn() }));
vi.mock("@/app/conta/alunos/actions", () => ({ deleteStudentAction: vi.fn() }));

import AccountHubPage from "@/app/conta/page";

const student = { id: "10000000-0000-4000-8000-000000000001", nickname: "Maria", gradeSlug: "ef-5", gradeLabel: "5º ano", createdAt: new Date("2026-09-01") };
const cart = (id: string, listId: string | null) => ({ id, isDemo: false, strategy: "cheapest", itemCount: 4, createdAt: new Date("2026-09-29T21:49:00Z"), listId });

async function hub(sp: Record<string, string> = {}) {
  render(await AccountHubPage({ searchParams: Promise.resolve(sp) } as never));
}

describe("/conta · hub · UX-048", () => {
  beforeEach(() => {
    requireAccess.mockReset().mockResolvedValue({ user: { id: "u1", email: "familia@listacerta.test" }, role: "parent" });
    getSessionActor.mockReset().mockResolvedValue({ userId: "u1" });
    listMyStudents.mockReset().mockResolvedValue([student]);
    listMySavedLists.mockReset().mockResolvedValue([]);
    listCartsForOwner.mockReset().mockResolvedValue([]);
    loadCartLabels.mockReset().mockResolvedValue({});
  });

  it("há uma ação principal: 'Buscar lista da escola' (quando já há aluno)", async () => {
    await hub();
    const primaries = screen.getAllByRole("link").filter((a) => a.className.includes("bg-tinta"));
    expect(primaries.map((a) => a.textContent)).toEqual(["Buscar lista da escola"]);
  });

  it("sem aluno a principal é 'Adicionar aluno' e a busca vira secundária", async () => {
    listMyStudents.mockResolvedValue([]);
    await hub();
    const primaries = screen.getAllByRole("link").filter((a) => a.className.includes("bg-tinta"));
    expect(primaries.map((a) => a.textContent)).toEqual(["Adicionar aluno"]);
    expect(screen.getByRole("link", { name: "Buscar lista da escola" }).className).not.toContain("bg-tinta");
  });

  it("atalhos: enviar a lista, minhas compras e minhas cotações", async () => {
    await hub();
    const shortcuts = screen.getByRole("navigation", { name: "Atalhos" });
    expect(within(shortcuts).getByRole("link", { name: /Enviar a lista da escola/ })).toHaveAttribute("href", "/enviar-lista");
    expect(within(shortcuts).getByRole("link", { name: /Meus envios/ })).toHaveAttribute("href", "/conta/envios");
    expect(within(shortcuts).getByRole("link", { name: /Minhas compras/ })).toHaveAttribute("href", "/conta/compras");
    expect(within(shortcuts).getByRole("link", { name: /Minhas cotações/ })).toHaveAttribute("href", "/cotacao");
  });

  it("não mostra 'Perfil Família' nem o botão de privacidade com o mesmo peso de 'Sair'", async () => {
    await hub();
    expect(screen.queryByText("Perfil")).toBeNull();
    const privacy = screen.getByRole("link", { name: "Privacidade e dados" });
    expect(privacy).toHaveAttribute("href", "/conta/privacidade");
    expect(privacy.className).not.toContain("border-tinta");
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("o carrinho tem o nome da escola e da série e a data, não a estratégia", async () => {
    listCartsForOwner.mockResolvedValue([cart("c1", "l1"), cart("c2", null)]);
    loadCartLabels.mockResolvedValue({ l1: { schoolName: "Escola Demo S29", gradeLabel: "5º ano" } });
    await hub();
    const list = screen.getByRole("list", { name: "Carrinhos recentes" });
    expect(within(list).getByText("Escola Demo S29 · 5º ano")).toBeInTheDocument();
    expect(within(list).getByText("Carrinho de 29/09/2026")).toBeInTheDocument();
    expect(within(list).queryByText("Mais barato")).toBeNull();
    expect(within(list).getAllByText(/29\/09\/2026/).length).toBeGreaterThan(0);
  });

  it("vazios do hub são uma frase contínua (sem link de 44 px dentro); a ação é a principal", async () => {
    await hub();
    const empty = screen.getByText(/Nenhum carrinho ainda\./);
    expect(empty.tagName).toBe("P");
    expect(empty.querySelector("a")).toBeNull();
    expect(screen.getByText(/Nenhuma lista salva ainda\./).querySelector("a")).toBeNull();
  });

  it("nenhum foco em Verde Certo sobre fundo claro (UX-056)", async () => {
    await hub();
    expect(document.body.innerHTML).not.toContain("outline-verde-certo");
  });
});

describe("/conta · aviso depois de salvar · UX-053", () => {
  beforeEach(() => {
    requireAccess.mockReset().mockResolvedValue({ user: { id: "u1", email: "f@x.test" }, role: "parent" });
    getSessionActor.mockReset().mockResolvedValue({ userId: "u1" });
    listMyStudents.mockReset().mockResolvedValue([student]);
    listMySavedLists.mockReset().mockResolvedValue([]);
    listCartsForOwner.mockReset().mockResolvedValue([]);
    loadCartLabels.mockReset().mockResolvedValue({});
  });
  it("?aviso=aluno-salvo mostra InlineStatus com o próximo passo", async () => {
    await hub({ aviso: "aluno-salvo" });
    expect(screen.getByRole("status")).toHaveTextContent(/Aluno salvo/);
  });
  it("aviso desconhecido não aparece", async () => {
    await hub({ aviso: "qualquer" });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
