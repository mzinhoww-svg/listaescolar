import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn().mockResolvedValue({ user: { email: "familia@listacerta.test" }, role: "parent" }) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: vi.fn().mockResolvedValue({ userId: "u", role: "parent" }) }));
vi.mock("@/features/cart/repository", () => ({ listCartsForOwner: vi.fn().mockResolvedValue([]) }));
vi.mock("@/features/saved-lists/queries", () => ({ listMySavedLists: vi.fn().mockResolvedValue([]) }));
vi.mock("@/features/students/queries", () => ({ listMyStudents: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/components/auth/sign-out-action", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn() }));

import AccountHubPage from "@/app/conta/page";
import { CopyLinkButton } from "@/components/share/CopyLinkButton";
import { SearchResults } from "@/components/schools/SearchResults";
import { qrMatrix, renderQrSvg } from "@/features/short-links/qr";

describe("hub da conta: Enviar a lista da escola (UX-012)", () => {
  it("tem o link para enviar a lista, como ação secundária", async () => {
    render(await AccountHubPage());
    const link = screen.getByRole("link", { name: "Enviar a lista da escola" });
    expect(link).toHaveAttribute("href", "/enviar-lista");
    expect(link.className).toContain("border-tinta");
  });
});

describe("hub da conta: Minhas compras (S29 T12, UX-025)", () => {
  it("liga /conta/compras junto das cotações, com o que a página faz", async () => {
    render(await AccountHubPage());
    const link = screen.getByRole("link", { name: /Minhas compras/ });
    expect(link).toHaveAttribute("href", "/conta/compras");
    expect(link.textContent).toMatch(/Informe se comprou/);
  });
});

describe("resultados da busca: Enviar a lista da escola (UX-012)", () => {
  const input = { q: "silva", qTooShort: false, page: 1 } as never;
  const school = {
    id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b", inep: "51001234", name: "Escola Municipal Antônio Silva", network: "municipal", neighborhood: null,
    municipalityId: "m", municipalityName: "Cuiabá", verificationStatus: "registered", isDemo: false, rank: 1,
  };
  it("com resultados, quem não achou a escola tem para onde ir", () => {
    render(<SearchResults input={input} result={{ kind: "results", schools: [school], total: 1, page: 1, pageCount: 1 } as never} />);
    expect(screen.getByRole("link", { name: /Enviar a lista da escola/ })).toHaveAttribute("href", "/enviar-lista");
  });

  it("nome de 90 caracteres não empurra os selos para fora: selos ficam abaixo do nome", () => {
    const name = "Escola Municipal de Educação Infantil e Ensino Fundamental Profa. Maria das Dores Rios S29";
    const { container } = render(<SearchResults input={input} result={{ kind: "results", schools: [{ ...school, name, isDemo: true }], total: 1, page: 1, pageCount: 1 } as never} />);
    const a = container.querySelector("li a")!;
    const nameEl = screen.getByText(name);
    expect(nameEl.className).toContain("[overflow-wrap:anywhere]");
    expect(a.className).toContain("min-w-0");
    // os selos estão na mesma coluna do nome (não numa terceira coluna que tira largura do nome)
    expect(nameEl.parentElement!.contains(screen.getByText("Demonstração"))).toBe(true);
  });
});

describe("Copiar link no sistema de botões (UX-022)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("usa o Button do sistema (contorno Tinta, 48 px) e anuncia 'Link copiado'", async () => {
    render(<CopyLinkButton link="https://listacerta.example/l/ABC" />);
    const btn = screen.getByRole("button", { name: "Copiar link" });
    expect(btn.className).toContain("border-tinta");
    expect(btn.className).toContain("h-12");
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("button", { name: /Link copiado/ })).toBeInTheDocument());
    expect(screen.getByText("Link copiado.")).toHaveAttribute("aria-live", "polite");
  });

  it("sem Clipboard API, pede para selecionar o link e diz por quê", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    render(<CopyLinkButton link="https://listacerta.example/l/ABC" />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Selecione o link/ })).toBeInTheDocument());
    expect(screen.getByText(/Não foi possível copiar/)).toBeInTheDocument();
  });
});

describe("QR aberto no navegador (UX-022)", () => {
  it("o SVG leva título (nome acessível e título da aba), com escape", () => {
    const svg = renderQrSvg(qrMatrix("https://listacerta.example/l/ABC"), { size: 128, color: "#0F1B2D", title: 'QR da lista <"x">' });
    expect(svg).toContain("<title>QR da lista &lt;&quot;x&quot;&gt;</title>");
    expect(svg).toContain('role="img"');
    expect(renderQrSvg(qrMatrix("x"), { size: 128, color: "#0F1B2D" })).not.toContain("<title>");
  });
});
