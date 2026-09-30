import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSchoolByInep = vi.fn();
const getPublishedList = vi.fn();
const getSessionActor = vi.fn();
vi.mock("@/features/schools/search/repository", () => ({ getSchoolByInep: (...a: unknown[]) => getSchoolByInep(...a) }));
vi.mock("@/features/lists/queries", () => ({
  getPublishedList: (...a: unknown[]) => getPublishedList(...a),
  listVersionHistory: async () => [],
}));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/notifications/queries", () => ({ isWatching: async () => false }));
vi.mock("@/features/students/queries", () => ({ listMyStudents: async () => [] }));
vi.mock("@/features/reports/actions", () => ({ submitReportAction: async () => undefined }));
vi.mock("@/app/conta/notificacoes/actions", () => ({ watchListAction: vi.fn(), unwatchListAction: vi.fn() }));
vi.mock("@/app/conta/listas-salvas/actions", () => ({ saveListAction: vi.fn() }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import ListPage from "@/app/escolas/[inep]/[serie]/page";
import { academicYears } from "@/features/grades/catalog";

const LONG = "Escola Municipal de Educação Infantil e Ensino Fundamental Profa. Maria das Dores Rios S29";
const school = { id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b", inep: "99029003", name: LONG, isDemo: true };
const year = academicYears(new Date())[1];
const VERSION = "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a02";
const item = (n: number, category: string | null) => ({ id: `3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a${10 + n}`, position: n, name: `Item ${n}`, normalizedName: `item ${n}`, category, quantity: n, unit: "un" });
const list = {
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a01",
  gradeSlug: "ef-5",
  schoolYear: year,
  publishedAt: "2027-01-10T15:00:00Z",
  isDemo: true,
  version: { id: VERSION, versionNumber: 1, status: "published" as const, publishedAt: "2027-01-10T15:00:00Z", itemCount: 3, items: [item(1, "Papelaria"), item(2, "Papelaria"), item(3, null)] },
};
const props = (serie = "ef-5", sp: Record<string, string> = { ano: String(year) }) => ({
  params: Promise.resolve({ inep: "99029003", serie }),
  searchParams: Promise.resolve(sp),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
  getSchoolByInep.mockResolvedValue(school);
  getPublishedList.mockResolvedValue(list);
  getSessionActor.mockResolvedValue(null);
});

describe("lista publicada: ações e feedback (UX-013, UX-014, UX-020, UX-021, UX-022, UX-024)", () => {
  it("oferece 'Pedir preço à papelaria do bairro' como ação secundária, abrindo o fluxo de cotação", async () => {
    render(await ListPage(props()));
    const quote = screen.getByRole("link", { name: "Pedir preço à papelaria do bairro" });
    expect(quote).toHaveAttribute("href", `/carrinho/novo?lista=${VERSION}&destino=cotacao`);
    expect(quote.className).toContain("border-tinta");
    expect(quote.className).not.toContain("bg-tinta");
    const main = screen.getByRole("link", { name: "Montar carrinho com esta lista" });
    expect(main.className).toContain("bg-tinta");
  });

  it("sem sessão avisa antes do clique que a ação pede entrada; com sessão o aviso some", async () => {
    const { unmount } = render(await ListPage(props()));
    expect(screen.getByText(/você entra com seu e-mail e volta para esta lista/)).toBeInTheDocument();
    unmount();
    getSessionActor.mockResolvedValue({ userId: "u", role: "parent" });
    render(await ListPage(props()));
    expect(screen.queryByText(/você entra com seu e-mail/)).toBeNull();
  });

  it("a ação principal fica à vista numa barra fixa que ocupa lugar no fluxo (não cobre conteúdo)", async () => {
    render(await ListPage(props()));
    const bar = screen.getByRole("link", { name: "Montar carrinho com esta lista" }).parentElement!;
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("bottom-0");
    expect(bar.className).not.toContain("fixed");
    expect(within(bar).getAllByRole("link")).toHaveLength(1);
  });

  it("'Denunciar' fica junto da lista, não na página da escola", async () => {
    render(await ListPage(props()));
    expect(screen.getByText("Encontrou um problema nesta lista?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Denunciar" }).className).toContain("border-tinta");
  });

  it("itens agrupados em lista contínua por categoria, sem cartão por linha nem caixa alta", async () => {
    const { container } = render(await ListPage(props()));
    const rows = container.querySelectorAll("#itens ~ div ul li, section[aria-labelledby='itens'] ul li");
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.className).not.toContain("bg-white");
    expect(container.querySelectorAll('section[aria-labelledby="itens"] ul.divide-y').length).toBe(2);
    expect(container.querySelector('section[aria-labelledby="itens"] h3')!.className).not.toContain("uppercase");
  });

  it("botões de compartilhar no sistema: 'Copiar link' e 'Baixar QR da lista'", async () => {
    render(await ListPage(props()));
    expect(screen.getByRole("button", { name: /Copiar link/ }).className).toContain("border-tinta");
    expect(screen.getByRole("link", { name: "Baixar QR da lista" })).toHaveAttribute("href", expect.stringContaining("/qr?download=1"));
    expect(screen.queryByText(/SVG/)).toBeNull();
  });

  it("nome de escola de 90 caracteres quebra linha no cabeçalho da lista (sem rolagem horizontal)", async () => {
    render(await ListPage(props()));
    expect(LONG.length).toBeGreaterThanOrEqual(90);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(LONG);
    expect(h1.className).toContain("[overflow-wrap:anywhere]");
    expect(h1.parentElement!.className).toContain("min-w-0");
  });
});

describe("série sem lista publicada (UX-012, UX-014)", () => {
  it("oferece enviar a lista, com escola, série e ano já escolhidos, e explica o login do 'Me avise'", async () => {
    getPublishedList.mockResolvedValue(null);
    render(await ListPage(props("ef-3")));
    expect(screen.getByRole("link", { name: "Enviar a lista desta série" })).toHaveAttribute(
      "href",
      `/enviar-lista?escola=99029003&serie=ef-3&ano=${year}`,
    );
    expect(screen.getByText(/Para ser avisado, você entra com seu e-mail/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escolher outra série" })).toHaveAttribute("href", "/escolas/99029003");
  });
});

describe("título de categoria (UX-020)", () => {
  it("categoria vinda em minúsculas aparece com a primeira letra maiúscula, sem depender de CSS", async () => {
    const { container } = render(await ListPage(props()));
    const titles = [...container.querySelectorAll('section[aria-labelledby="itens"] h3')].map((h) => h.textContent);
    expect(titles).toEqual(["Papelaria", "Outros itens"]);
  });
});
