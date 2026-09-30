import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

import { getPurchaseChannels } from "@/features/site/channels";

import { CHANNELS, loadPage, renderInSite } from "./helpers";

beforeEach(() => vi.mocked(getPurchaseChannels).mockResolvedValue(CHANNELS));

describe("UX-001 · fim de página com ação adiante", () => {
  it.each(["/como-funciona", "/sobre", "/termos", "/privacidade"] as const)("%s fecha com 'Buscar a escola' dentro do main", async (route) => {
    const Page = await loadPage(route);
    const { container } = await renderInSite(Page);
    const main = container.querySelector("main")!;
    expect(within(main).getByRole("link", { name: "Buscar a escola" })).toHaveAttribute("href", "/escolas");
  });
  it.each(["/sobre", "/termos", "/privacidade"] as const)("%s tem 'Voltar ao início' no main", async (route) => {
    const Page = await loadPage(route);
    const { container } = await renderInSite(Page);
    expect(within(container.querySelector("main")!).getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
  });
  it("/pesquisa/privacidade fecha com 'Começar a pesquisa'", async () => {
    const Page = (await import("@/app/pesquisa/privacidade/page")).default;
    render(<Page />);
    expect(screen.getByRole("link", { name: "Começar a pesquisa" })).toHaveAttribute("href", "/pesquisa");
  });
});

describe("UX-002 · caminho de volta ao site nas telas da pesquisa", () => {
  it("login dos resultados tem 'Voltar ao site' e a área é noindex", async () => {
    const mod = await import("@/app/pesquisa/resultados/login/page");
    render(<mod.default />);
    expect(screen.getByRole("link", { name: "Voltar ao site" })).toHaveAttribute("href", "/");
    expect(mod.metadata.robots).toMatchObject({ index: false });
  });
  it("Cabecalho com voltarAoSite liga o logo ao site; sem a prop não liga", async () => {
    const { Cabecalho } = await import("@/components/pesquisa/Cabecalho");
    const { container, rerender } = render(<Cabecalho />);
    expect(container.querySelector("a")).toBeNull();
    rerender(<Cabecalho voltarAoSite />);
    expect(screen.getByRole("link", { name: "Voltar ao site" })).toHaveAttribute("href", "/");
  });
  it("resultados (protegida) também é noindex", async () => {
    const mod = await import("@/app/pesquisa/resultados/page");
    expect(mod.metadata.robots).toMatchObject({ index: false });
  });
});
