import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));

import { getPurchaseChannels } from "@/features/site/channels";

import { CHANNELS, loadPage, renderInSite, SITE_ROUTES } from "./helpers";

const channels = vi.mocked(getPurchaseChannels);

beforeEach(() => channels.mockResolvedValue(CHANNELS));

describe("páginas do site", () => {
  it.each(SITE_ROUTES)("%s: um h1, main#conteudo, skip link e landmarks", async (route) => {
    const Page = await loadPage(route);
    const { container } = await renderInSite(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const main = container.querySelector("main#conteudo");
    expect(main).not.toBeNull();
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).toHaveAttribute("href", "#conteudo");
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    expect(screen.getAllByRole("navigation").every((n) => n.getAttribute("aria-label"))).toBe(true);
  });
});

describe("landing", () => {
  it("h1, busca da S04, âncoras, CTA de escola e FAQ em details", async () => {
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    expect(container.querySelector('form[method="get"][action="/escolas"]')).not.toBeNull();
    for (const id of ["pais", "escolas", "como-funciona", "perguntas"]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
      expect(container.querySelector(`header a[href="/#${id}"]`), `nav ${id}`).not.toBeNull();
    }
    expect(screen.getByRole("link", { name: "Sou escola" })).toHaveAttribute("href", "/escolas");
    expect(screen.getByRole("link", { name: "Cadastrar minha escola" })).toHaveAttribute("href", "/escolas");
    expect(screen.getByText(/Busque sua escola e peça para administrar a página/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
    expect(screen.getByRole("link", { name: "Privada" })).toHaveAttribute("href", "/escolas?rede=privada");
    const details = container.querySelectorAll("#perguntas details");
    expect(details.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(details[0]!.querySelector("summary")!);
    expect(screen.getAllByText("Demonstração").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Cuiabá · MT");
  });

  it("mostra os varejistas ativos por nome e omite Papelarias sem papelaria", async () => {
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    expect(container.textContent).toContain("Amazon");
    expect(container.textContent).toContain("Mercado Livre");
    expect(container.textContent).not.toContain("Papelarias do bairro");
  });

  it("mostra Papelarias do bairro só com hasStationeries", async () => {
    channels.mockResolvedValue({ ...CHANNELS, hasStationeries: true });
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    expect(container.textContent).toContain("Papelarias do bairro");
  });

  it("omite a faixa de canais com null (erro de banco)", async () => {
    channels.mockResolvedValue(null);
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    expect(container.textContent).not.toContain("Onde comprar");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("como funciona e sobre", () => {
  it("como funciona: título e três etapas com selo de demonstração", async () => {
    const Page = await loadPage("/como-funciona");
    await renderInSite(Page);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Da lista oficial à compra certa");
    expect(screen.getAllByText("Demonstração")).toHaveLength(3);
  });

  it("sobre: contato por placeholder", async () => {
    const Page = await loadPage("/sobre");
    const { container } = await renderInSite(Page);
    expect(container.querySelector("mark")?.textContent).toBe("[a definir: e-mail de contato]");
  });
});
