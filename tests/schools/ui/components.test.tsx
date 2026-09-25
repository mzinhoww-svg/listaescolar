import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClaimBlock } from "@/components/schools/ClaimBlock";
import { foundLabel, formatPhone, initials } from "@/components/schools/format";
import { NetworkChips } from "@/components/schools/NetworkChips";
import { Pagination } from "@/components/schools/Pagination";
import { ProfileInfo } from "@/components/schools/ProfileInfo";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { SearchResults } from "@/components/schools/SearchResults";
import { StatusBadges } from "@/components/schools/StatusBadges";
import { parseSearchParams } from "@/features/schools/search/params";
import type { SchoolListItem, SchoolProfile } from "@/features/schools/search/types";

import { GradeYearPicker } from "@/app/escolas/[inep]/GradeYearPicker";
import { SearchForm } from "@/app/escolas/SearchForm";

const item = (over: Partial<SchoolListItem> = {}): SchoolListItem => ({
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b",
  inep: "51001234",
  name: "Escola Municipal Antônio Silva",
  network: "municipal",
  neighborhood: "Centro Sul",
  municipalityId: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6c",
  municipalityName: "Cuiabá",
  verificationStatus: "registered",
  isDemo: false,
  rank: 1,
  ...over,
});

const profile = (over: Partial<SchoolProfile> = {}): SchoolProfile => ({
  id: item().id,
  inep: "51001234",
  name: "Escola Municipal Antônio Silva",
  network: "municipal",
  neighborhood: "Centro Sul",
  address: "Rua das Flores, 100",
  phone: "6533334444",
  municipalityId: item().municipalityId,
  municipalityName: "Cuiabá",
  uf: "MT",
  verificationStatus: "registered",
  isDemo: false,
  ...over,
});

describe("format", () => {
  it("telefone, iniciais e contagem", () => {
    expect(formatPhone("6533334444")).toBe("(65) 3333-4444");
    expect(formatPhone("65933334444")).toBe("(65) 93333-4444");
    expect(formatPhone("123")).toBe("123");
    expect(initials("Escola Municipal de Educação")).toBe("EM");
    expect(initials("")).toBe("E");
    expect(foundLabel(1)).toBe("1 escola encontrada");
    expect(foundLabel(45)).toBe("45 escolas encontradas");
  });
});

describe("StatusBadges / SchoolCard", () => {
  it("registered aparece como Cadastrada, nunca como verificada", () => {
    render(<StatusBadges status="registered" isDemo={false} />);
    expect(screen.getByText("Cadastrada")).toBeInTheDocument();
    expect(screen.queryByText(/verificad/i)).toBeNull();
  });

  it("verified usa 'Escola verificada'; demo acrescenta o selo Demonstração", () => {
    render(<StatusBadges status="verified" isDemo />);
    expect(screen.getByText("Escola verificada")).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
  });

  it("card liga ao perfil e mostra INEP, bairro e rede", () => {
    render(<ul><SchoolCard school={item()} /></ul>);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/escolas/51001234");
    expect(link).toHaveTextContent("INEP 51001234 · Centro Sul · Municipal");
  });

  it("card sem bairro não mostra 'null'", () => {
    render(<ul><SchoolCard school={item({ neighborhood: null })} /></ul>);
    expect(screen.getByRole("link")).not.toHaveTextContent(/null|undefined/);
  });
});

describe("SearchResults", () => {
  const ok = (schools: SchoolListItem[], total: number, page = 1, pageCount = 1) =>
    ({ kind: "results", schools, total, page, pageCount }) as const;

  it("lista semântica com o total do banco", () => {
    render(<SearchResults input={parseSearchParams({ q: "silva" })} result={ok([item()], 1)} />);
    expect(screen.getByRole("heading", { name: "1 escola encontrada" })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("vazio: 'Nenhuma escola encontrada' com sugestão", () => {
    render(<SearchResults input={parseSearchParams({ q: "zzzz" })} result={ok([], 0, 1, 0)} />);
    expect(screen.getByText("Nenhuma escola encontrada")).toBeInTheDocument();
    expect(screen.getByText(/Confira a grafia/)).toBeInTheDocument();
  });

  it("texto curto: pede mais letras", () => {
    render(<SearchResults input={parseSearchParams({ q: "a" })} result={ok([], 0, 1, 0)} />);
    expect(screen.getByText("Digite um pouco mais")).toBeInTheDocument();
  });
});

describe("Pagination / NetworkChips", () => {
  it("preserva filtros e não aparece com uma só página", () => {
    const input = parseSearchParams({ q: "silva", rede: "privada", pagina: "2" });
    const { container, rerender } = render(<Pagination input={input} page={2} pageCount={3} />);
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/escolas?q=silva&rede=privada");
    expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/escolas?q=silva&rede=privada&pagina=3");
    rerender(<Pagination input={input} page={1} pageCount={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("chips marcam a rede ativa e voltam à página 1", () => {
    render(<NetworkChips input={parseSearchParams({ q: "silva", rede: "estadual", pagina: "4" })} />);
    expect(screen.getByRole("link", { name: "Estadual" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Todas" })).toHaveAttribute("href", "/escolas?q=silva");
    expect(screen.getByRole("link", { name: "Municipal" })).toHaveAttribute("href", "/escolas?q=silva&rede=municipal");
  });
});

describe("ProfileInfo / ClaimBlock", () => {
  it("mostra dados existentes e nunca e-mail", () => {
    const { container } = render(<ProfileInfo school={profile()} />);
    expect(screen.getByText("(65) 3333-4444")).toBeInTheDocument();
    expect(screen.getByText("Rua das Flores, 100")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/e-?mail|@/i);
    expect(screen.getByText(/não indica verificação/)).toBeInTheDocument();
  });

  it("omite telefone e endereço ausentes (sem 'N/A')", () => {
    const { container } = render(<ProfileInfo school={profile({ phone: null, address: null })} />);
    expect(screen.queryByText("Telefone")).toBeNull();
    expect(screen.queryByText("Endereço")).toBeNull();
    expect(container.textContent).not.toMatch(/N\/A|null|undefined/);
  });

  it("escola demo avisa que os dados são fictícios", () => {
    render(<ProfileInfo school={profile({ isDemo: true })} />);
    expect(screen.getByText(/Demonstração: dados fictícios/)).toBeInTheDocument();
  });

  it("botão Reivindicar perfil aponta para a rota da S06; suspensa não oferece", () => {
    const { rerender } = render(<ClaimBlock inep="51001234" status="registered" />);
    expect(screen.getByRole("link", { name: "Reivindicar perfil" })).toHaveAttribute("href", "/escolas/51001234/reivindicar");
    rerender(<ClaimBlock inep="51001234" status="suspended" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("SearchForm", () => {
  it("é um form GET para /escolas e preserva filtros em campos ocultos", () => {
    const { container } = render(<SearchForm defaultValue="silva" preserve={{ rede: "privada" }} />);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/escolas");
    expect(container.querySelector('input[name="rede"]')).toHaveValue("privada");
    expect(container.querySelector('input[name="pagina"]')).toBeNull();
    expect(screen.getByLabelText("Buscar escola pelo nome ou INEP")).toHaveValue("silva");
  });

  it("botão limpar esvazia o campo", () => {
    render(<SearchForm defaultValue="silva" />);
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByLabelText("Buscar escola pelo nome ou INEP")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Limpar busca" })).toBeNull();
  });
});

describe("GradeYearPicker", () => {
  it("atualiza a query string sem chamada de rede", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<GradeYearPicker inep="51001234" serie={null} ano={null} years={[2026, 2027]} />);
    expect(screen.getByText("Escolha a série para ver a lista")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "ef-4" } });
    fireEvent.change(screen.getByLabelText("Ano letivo"), { target: { value: "2027" } });
    expect(replace).toHaveBeenLastCalledWith(null, "", "?serie=ef-4&ano=2027");
    expect(screen.getByText("4º ano · 2027: lista não publicada")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    replace.mockRestore();
  });

  it("parte da seleção vinda da URL e o form (sem JS) usa GET no perfil", () => {
    const { container } = render(<GradeYearPicker inep="51001234" serie="em-2" ano={2027} years={[2026, 2027]} />);
    expect(screen.getByLabelText("Série")).toHaveValue("em-2");
    expect(screen.getByLabelText("Ano letivo")).toHaveValue("2027");
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/escolas/51001234");
  });
});
