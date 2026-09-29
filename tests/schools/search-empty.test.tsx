import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublishedShortcuts } from "@/components/schools/PublishedShortcuts";
import { SearchResults } from "@/components/schools/SearchResults";
import { parseSearchParams } from "@/features/schools/search/params";

const empty = { kind: "results" as const, schools: [], total: 0, page: 1, pageCount: 0 };

describe("busca sem resultado (M06)", () => {
  it("oferece saídas com texto claro (o aviso de lista só existe com escola escolhida)", () => {
    render(<SearchResults input={parseSearchParams({ q: "zzzz" })} result={empty} />);
    expect(screen.getByText("Nenhuma escola encontrada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enviar a lista da escola" })).toHaveAttribute("href", "/enviar-lista");
    expect(screen.getByRole("link", { name: "Ver escolas de Cuiabá" })).toHaveAttribute("href", "/escolas");
    expect(screen.queryByRole("link", { name: "Avisar quando a lista sair" })).toBeNull();
  });

  it("texto curto demais não mostra saídas", () => {
    render(<SearchResults input={parseSearchParams({ q: "a" })} result={empty} />);
    expect(screen.queryByRole("link", { name: "Enviar a lista da escola" })).toBeNull();
  });
});

describe("atalhos de escolas com lista publicada", () => {
  const item = { inep: "51000001", schoolName: "Escola A", gradeSlug: "ef-1", gradeLabel: "1º ano", year: 2027, isDemo: true, href: "/escolas/51000001/ef-1?ano=2027" };

  it("sem nenhuma escola a seção não aparece", () => {
    const { container } = render(<PublishedShortcuts items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lista escolas reais e marca Demonstração quando is_demo", () => {
    render(<PublishedShortcuts items={[item, { ...item, inep: "51000002", schoolName: "Escola B", isDemo: false, href: "/x" }]} />);
    expect(screen.getByRole("link", { name: /Escola A/ })).toHaveAttribute("href", item.href);
    expect(screen.getAllByText("Demonstração")).toHaveLength(1);
  });
});
