// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
const getSessionActor = vi.fn();
const listMySubmissions = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/submissions/my-submissions", () => ({ listMySubmissions: (...a: unknown[]) => listMySubmissions(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import EnviosPage from "@/app/conta/envios/page";

const ID1 = "10000000-0000-4000-8000-0000000000a1";
const ID2 = "10000000-0000-4000-8000-0000000000a2";
const sub = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id, status, grade: "5º ano", schoolYear: 2027, schoolName: "Escola Modelo", createdAt: "2026-09-29T14:00:00Z", isDemo: false, ...over,
});

describe("/conta/envios · Meus envios (UX-060)", () => {
  beforeEach(() => {
    requireAccess.mockReset().mockResolvedValue({ user: { id: "u1" }, role: "parent" });
    getSessionActor.mockReset().mockResolvedValue({ userId: "u1" });
    listMySubmissions.mockReset().mockResolvedValue([]);
  });

  it("exige acesso e volta para a conta", async () => {
    render(await EnviosPage());
    expect(requireAccess).toHaveBeenCalledWith("/conta/envios");
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/conta");
    expect(screen.getByRole("heading", { level: 1, name: "Meus envios" })).toBeInTheDocument();
  });

  it("vazio: explica e leva a enviar a lista (única ação principal)", async () => {
    render(await EnviosPage());
    expect(screen.getByText(/Você ainda não enviou nenhuma lista/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enviar a lista da escola" })).toHaveAttribute("href", "/enviar-lista");
  });

  it("um cartão por envio, com estado e link ao andamento", async () => {
    listMySubmissions.mockResolvedValue([sub(ID1, "human_review"), sub(ID2, "published", { isDemo: true, schoolName: null, grade: null, schoolYear: null })]);
    render(await EnviosPage());
    const list = screen.getByRole("list", { name: "Envios" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", `/enviar-lista/${ID1}`);
    expect(items[0]).toHaveTextContent("Escola Modelo");
    expect(items[0]).toHaveTextContent("5º ano · 2027");
    expect(items[0]).toHaveTextContent("Em revisão pela equipe");
    expect(items[1]).toHaveTextContent("Escola não informada");
    expect(items[1]).toHaveTextContent("Lista publicada");
    expect(items[1]).toHaveTextContent("Demonstração");
  });

  it("falha na consulta: erro com 'Tentar de novo' e sem dado inventado", async () => {
    listMySubmissions.mockRejectedValue(new Error("x"));
    render(await EnviosPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar seus envios");
    expect(screen.getByRole("link", { name: "Tentar de novo" })).toHaveAttribute("href", "/conta/envios");
  });
});
