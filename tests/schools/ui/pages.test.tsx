import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SchoolProfile, SearchResult } from "@/features/schools/search/types";

const searchSchools = vi.fn();
const getSchoolByInep = vi.fn();
vi.mock("@/features/schools/search/repository", () => ({
  searchSchools: (...a: unknown[]) => searchSchools(...a),
  getSchoolByInep: (...a: unknown[]) => getSchoolByInep(...a),
}));
// `cache` do React não deduplica fora do servidor de RSC; nos testes vale a chamada direta.
const getPublishedList = vi.fn();
const listPublishedGradeYears = vi.fn();
vi.mock("@/features/lists/queries", () => ({
  getPublishedList: (...a: unknown[]) => getPublishedList(...a),
  listPublishedGradeYears: (...a: unknown[]) => listPublishedGradeYears(...a),
  listVersionHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "test-nonce" }) }));
vi.mock("@/features/claims/queries", () => ({ getMyClaimForSchool: vi.fn().mockResolvedValue(null) }));
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T,>(f: T) => f,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import SearchPage, { generateMetadata as searchMeta } from "@/app/escolas/page";
import SchoolPage, { generateMetadata as schoolMeta } from "@/app/escolas/[inep]/page";

const school = (over: Partial<SchoolProfile> = {}): SchoolProfile => ({
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b",
  inep: "51001234",
  name: "Escola Municipal Antônio Silva",
  network: "municipal",
  neighborhood: "Centro Sul",
  address: "Rua das Flores, 100",
  phone: "6533334444",
  municipalityId: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6c",
  municipalityName: "Cuiabá",
  uf: "MT",
  verificationStatus: "verified",
  isDemo: false,
  ...over,
});

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const results = (over: Partial<Extract<SearchResult, { kind: "results" }>> = {}): SearchResult => ({
  kind: "results",
  schools: [],
  total: 0,
  page: 1,
  pageCount: 0,
  ...over,
});

beforeEach(() => {
  searchSchools.mockReset();
  getSchoolByInep.mockReset();
  getPublishedList.mockReset().mockResolvedValue(null);
  listPublishedGradeYears.mockReset().mockResolvedValue([]);
});

describe("/escolas", () => {
  it("INEP existente redireciona ao perfil; página fora do intervalo volta à página 1", async () => {
    searchSchools.mockResolvedValueOnce({ kind: "redirect", inep: "51001234" });
    await expect(SearchPage({ searchParams: sp({ q: "51001234" }) })).rejects.toThrow(
      "REDIRECT:/escolas/51001234",
    );
    searchSchools.mockResolvedValueOnce({ kind: "page_out_of_range", page: 9 });
    await expect(
      SearchPage({ searchParams: sp({ q: "silva", rede: "privada", pagina: "9" }) }),
    ).rejects.toThrow("REDIRECT:/escolas?q=silva&rede=privada");
  });

  it("vazio mostra 'Nenhuma escola encontrada', não erro", async () => {
    searchSchools.mockResolvedValueOnce(results());
    render(await SearchPage({ searchParams: sp({ q: "zzzz" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Buscar escola" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma escola encontrada")).toBeInTheDocument();
  });

  it("falha do banco propaga (error.tsx trata) e não vira 'vazio'", async () => {
    searchSchools.mockRejectedValueOnce(new Error("school_search_failed"));
    await expect(SearchPage({ searchParams: sp({ q: "silva" }) })).rejects.toThrow(
      "school_search_failed",
    );
  });

  it("metadados: noindex com parâmetro cru, index sem", async () => {
    expect((await searchMeta({ searchParams: sp({ pagina: "abc" }) })).robots).toMatchObject({
      index: false,
    });
    expect((await searchMeta({ searchParams: sp() })).robots).toMatchObject({ index: true });
  });
});

describe("/escolas/[inep]", () => {
  const props = (inep = "51001234") => ({ params: Promise.resolve({ inep }) });

  it("404 para escola inexistente ou de município desabilitado (null)", async () => {
    getSchoolByInep.mockResolvedValue(null);
    await expect(SchoolPage(props("99999999"))).rejects.toThrow("NOT_FOUND");
    expect((await schoolMeta(props("99999999"))).robots).toMatchObject({ index: false });
  });

  it("escola verificada: JSON-LD escapado, indexável, sem e-mail", async () => {
    getSchoolByInep.mockResolvedValue(school({ name: "</script><b>X" }));
    const { container } = render(await SchoolPage(props()));
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld).not.toBeNull();
    expect(ld?.innerHTML).not.toContain("<");
    expect(JSON.parse(ld?.innerHTML ?? "{}").name).toBe("</script><b>X");
    expect(container.innerHTML).not.toMatch(/mailto:|[\w.]+@[\w.]+/);
    expect(screen.getByText("Esta escola já tem administrador")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pedir para administrar/ })).toBeNull();
  });

  it("escola demo: selo Demonstração e sem JSON-LD; metadados noindex", async () => {
    getSchoolByInep.mockResolvedValue(school({ isDemo: true, verificationStatus: "registered" }));
    const { container } = render(await SchoolPage(props()));
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.getAllByText("Demonstração").length).toBeGreaterThan(0);
    expect(screen.getByText(/Demonstração: dados fictícios/)).toBeInTheDocument();
    expect(screen.getByText("Você trabalha nesta escola?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir para administrar" })).toHaveAttribute("href", "/escolas/51001234/reivindicar");
    const m = await schoolMeta(props());
    expect(m.robots).toMatchObject({ index: false });
    expect(String(m.title)).toContain("Demonstração");
  });

  it("suspensa: aviso, noindex, sem JSON-LD e sem CTA de reivindicação", async () => {
    getSchoolByInep.mockResolvedValue(school({ verificationStatus: "suspended" }));
    const { container } = render(await SchoolPage(props()));
    expect(screen.getByText(/perfil está suspenso/)).toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Pedir para administrar" })).toBeNull();
  });

  it("com listas publicadas: os atalhos levam direto à lista, sem seletor de série e ano", async () => {
    getSchoolByInep.mockResolvedValue(school());
    listPublishedGradeYears.mockResolvedValueOnce([{ gradeSlug: "ef-4", year: 2027 }]);
    render(await SchoolPage(props()));
    expect(screen.getByRole("link", { name: "4º ano · 2027" })).toHaveAttribute("href", "/escolas/51001234/ef-4?ano=2027");
    expect(screen.queryByLabelText("Série")).toBeNull();
    expect(screen.queryByLabelText("Ano letivo")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver lista" })).toBeNull();
    expect(screen.getByRole("link", { name: "Enviar a lista desta escola" })).toHaveAttribute("href", "/enviar-lista?escola=51001234");
  });

  it("sem lista publicada: o caminho é enviar a lista (UX-012), não um beco", async () => {
    getSchoolByInep.mockResolvedValue(school());
    listPublishedGradeYears.mockResolvedValueOnce([]);
    render(await SchoolPage(props()));
    expect(screen.getByText("Ainda não há lista publicada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enviar a lista desta escola" })).toHaveAttribute("href", "/enviar-lista?escola=51001234");
  });

  it("falha ao consultar as listas vira 'indisponível' e não derruba o perfil nem afirma 'nenhuma lista'", async () => {
    getSchoolByInep.mockResolvedValue(school());
    listPublishedGradeYears.mockRejectedValueOnce(new Error("lists: consulta falhou (XX000)"));
    render(await SchoolPage(props()));
    expect(screen.getByText(/Não foi possível consultar as listas agora/)).toBeInTheDocument();
    expect(screen.queryByText("Ainda não há lista publicada")).toBeNull();
    expect(screen.getByRole("heading", { name: /Escola Municipal Antônio Silva/ })).toBeInTheDocument();
  });

  it("nome de escola de 90 caracteres quebra linha (sem rolagem horizontal) no cabeçalho e no cartão (UX-024)", async () => {
    const longName = "Escola Municipal de Educação Infantil e Ensino Fundamental Profa. Maria das Dores Rios S29";
    expect(longName.length).toBeGreaterThanOrEqual(90);
    getSchoolByInep.mockResolvedValue(school({ name: longName }));
    render(await SchoolPage(props()));
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("[overflow-wrap:anywhere]");
    expect(h1.parentElement?.className).toContain("min-w-0");
  });

  it("primeira menção de INEP vem explicada (UX-015)", async () => {
    getSchoolByInep.mockResolvedValue(school());
    const { container } = render(await SchoolPage(props()));
    const text = container.textContent ?? "";
    const i = text.indexOf("INEP");
    expect(text.slice(i, i + 90)).toContain("o número da escola no Censo Escolar");
  });

  it("selo do perfil com vocabulário da marca, sem 'Com admin' nem 'vínculo do representante' (UX-021)", async () => {
    getSchoolByInep.mockResolvedValue(school());
    const { container } = render(await SchoolPage(props()));
    expect(container.textContent).not.toMatch(/Com admin\b|vínculo do representante|Reivindicad/);
    expect(container.textContent).toContain("Com administrador");
  });
});
