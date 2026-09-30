import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));

import { getPurchaseChannels } from "@/features/site/channels";
import { SearchForm } from "@/app/escolas/SearchForm";

import { render } from "@testing-library/react";

import { CHANNELS, loadPage, renderInSite } from "../site/helpers";

beforeEach(() => vi.mocked(getPurchaseChannels).mockResolvedValue(CHANNELS));

const EXPLANATION = "o número da escola no Censo Escolar";

/** A primeira menção de "INEP" no texto visível precisa vir com a explicação logo depois. */
function firstInepIsExplained(text: string): boolean {
  const i = text.indexOf("INEP");
  return i === -1 || text.slice(i, i + 90).includes(EXPLANATION);
}

describe("home: caminhos de entrada (UX-012, UX-013, UX-018)", () => {
  it("'Minha escola não aparece' leva a Enviar a lista da escola", async () => {
    const { container } = await renderInSite(await loadPage("/"));
    const faq = container.querySelector("#perguntas")!;
    const link = within(faq as HTMLElement).getByRole("link", { name: "Enviar a lista da escola" });
    expect(link).toHaveAttribute("href", "/enviar-lista");
    expect(link.className).toContain("min-h-11");
  });

  it("'Sou papelaria' está no hero e no rodapé, ao lado de 'Sou escola'", async () => {
    const { container } = await renderInSite(await loadPage("/"));
    const hero = container.querySelector("#hero-t")!.closest("section") as HTMLElement;
    expect(within(hero).getByRole("link", { name: "Sou papelaria" })).toHaveAttribute("href", "/cadastrar-papelaria");
    expect(within(hero).getByRole("link", { name: "Sou escola" })).toHaveAttribute("href", "/escolas");
    const footer = container.querySelector("footer") as HTMLElement;
    expect(within(footer).getByRole("link", { name: "Sou papelaria" })).toHaveAttribute("href", "/cadastrar-papelaria");
    expect(within(footer).getByRole("link", { name: "Sou escola" })).toHaveAttribute("href", "/escolas");
  });

  it("o texto do cartão de exemplo 'Pedir preço à papelaria do bairro' é um link", async () => {
    await renderInSite(await loadPage("/"));
    expect(screen.getByRole("link", { name: "Pedir preço à papelaria do bairro" })).toHaveAttribute("href", "/escolas");
  });
});

describe("home: menu, chips e vocabulário (UX-015, UX-016, UX-019)", () => {
  it("menu do topo e chips de rede quebram linha em vez de rolar (nada cortado a 390 px)", async () => {
    const { container } = await renderInSite(await loadPage("/"));
    const nav = container.querySelector('header nav[aria-label="Seções"]')!;
    expect(nav.className).not.toContain("overflow-x-auto");
    expect(nav.className).not.toContain("mask-image");
    expect(nav.querySelector("ul")!.className).toContain("flex-wrap");
    const chips = container.querySelector('nav[aria-label="Buscar por rede"]')!;
    expect(chips.className).not.toContain("overflow-x-auto");
    expect(chips.querySelector("ul")!.className).toContain("flex-wrap");
  });

  it("INEP vem com explicação na primeira menção; pedido de cotação, não orçamento", async () => {
    const { container } = await renderInSite(await loadPage("/"));
    expect(firstInepIsExplained(container.textContent ?? "")).toBe(true);
    expect(container.textContent).not.toMatch(/or[çc]amento/i);
    expect(container.textContent).toContain("pedido de cotação");
  });

  it("legendas sem caixa alta espaçada; cartão de exemplo sem verde de 'resolvido'", async () => {
    const { container } = await renderInSite(await loadPage("/"));
    expect(container.querySelectorAll('[class*="uppercase"]').length).toBe(0);
    const card = container.querySelector('figure[aria-label="Exemplo ilustrativo de lista"]')!;
    expect(card.innerHTML).not.toMatch(/verde-certo/);
    expect(card.querySelectorAll("svg path").length).toBe(0);
  });
});

describe("busca de escola: INEP explicado (UX-015)", () => {
  it("a busca explica o código INEP logo abaixo do campo, antes de qualquer outra menção", () => {
    const { container } = render(<SearchForm />);
    expect(firstInepIsExplained(container.textContent ?? "")).toBe(true);
    expect(screen.getByRole("searchbox")).toHaveAttribute("aria-describedby", "q-hint");
    expect(container.querySelector("#q-hint")?.textContent).toContain(EXPLANATION);
  });
});
