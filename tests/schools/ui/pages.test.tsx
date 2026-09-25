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
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import SearchPage, { generateMetadata as searchMeta } from "@/app/escolas/page";
import SchoolPage, { generateMetadata as schoolMeta } from "@/app/escolas/[inep]/page";
import ClaimPage from "@/app/escolas/[inep]/reivindicar/page";

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
});

describe("/escolas", () => {
  it("INEP existente redireciona ao perfil; página fora do intervalo volta à página 1", async () => {
    searchSchools.mockResolvedValueOnce({ kind: "redirect", inep: "51001234" });
    await expect(SearchPage({ searchParams: sp({ q: "51001234" }) })).rejects.toThrow("REDIRECT:/escolas/51001234");
    searchSchools.mockResolvedValueOnce({ kind: "page_out_of_range", page: 9 });
    await expect(SearchPage({ searchParams: sp({ q: "silva", rede: "privada", pagina: "9" }) })).rejects.toThrow(
      "REDIRECT:/escolas?q=silva&rede=privada",
    );
  });

  it("vazio mostra 'Nenhuma escola encontrada', não erro", async () => {
    searchSchools.mockResolvedValueOnce(results());
    render(await SearchPage({ searchParams: sp({ q: "zzzz" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Buscar escola" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma escola encontrada")).toBeInTheDocument();
  });

  it("falha do banco propaga (error.tsx trata) e não vira 'vazio'", async () => {
    searchSchools.mockRejectedValueOnce(new Error("school_search_failed"));
    await expect(SearchPage({ searchParams: sp({ q: "silva" }) })).rejects.toThrow("school_search_failed");
  });

  it("metadados: noindex com parâmetro cru, index sem", async () => {
    expect((await searchMeta({ searchParams: sp({ pagina: "abc" }) })).robots).toMatchObject({ index: false });
    expect((await searchMeta({ searchParams: sp() })).robots).toMatchObject({ index: true });
  });
});

describe("/escolas/[inep]", () => {
  const props = (inep = "51001234", q: Record<string, string> = {}) => ({ params: Promise.resolve({ inep }), searchParams: sp(q) });

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
    expect(screen.getByRole("link", { name: "Reivindicar perfil" })).toBeInTheDocument();
  });

  it("escola demo: selo Demonstração e sem JSON-LD; metadados noindex", async () => {
    getSchoolByInep.mockResolvedValue(school({ isDemo: true }));
    const { container } = render(await SchoolPage(props()));
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.getAllByText("Demonstração").length).toBeGreaterThan(0);
    const m = await schoolMeta(props());
    expect(m.robots).toMatchObject({ index: false });
    expect(String(m.title)).toContain("Demonstração");
  });

  it("suspensa: aviso, noindex, sem JSON-LD e sem CTA de reivindicação", async () => {
    getSchoolByInep.mockResolvedValue(school({ verificationStatus: "suspended" }));
    const { container } = render(await SchoolPage(props()));
    expect(screen.getByText(/perfil está suspenso/)).toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Reivindicar perfil" })).toBeNull();
  });

  it("série e ano válidos da URL chegam ao seletor; inválidos são ignorados", async () => {
    getSchoolByInep.mockResolvedValue(school());
    const y = new Date().getUTCFullYear();
    const { unmount } = render(await SchoolPage(props("51001234", { serie: "ef-4", ano: String(y + 1) })));
    expect(screen.getByLabelText("Série")).toHaveValue("ef-4");
    expect(screen.getByLabelText("Ano letivo")).toHaveValue(String(y + 1));
    unmount();
    render(await SchoolPage(props("51001234", { serie: "xx", ano: "1900" })));
    expect(screen.getByLabelText("Série")).toHaveValue("");
    expect(screen.getByLabelText("Ano letivo")).toHaveValue(String(y));
  });
});

describe("/escolas/[inep]/reivindicar", () => {
  it("página honesta, sem formulário; 404 se a escola não existe", async () => {
    getSchoolByInep.mockResolvedValueOnce(school());
    const { container } = render(await ClaimPage({ params: Promise.resolve({ inep: "51001234" }) }));
    expect(screen.getByRole("heading", { name: "Reivindicação em implantação" })).toBeInTheDocument();
    expect(container.querySelector("form, input")).toBeNull();
    getSchoolByInep.mockResolvedValueOnce(null);
    await expect(ClaimPage({ params: Promise.resolve({ inep: "99999999" }) })).rejects.toThrow("NOT_FOUND");
  });
});
