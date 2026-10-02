import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoStationeries } from "@/components/leads/NoStationeries";

const props = { cartHref: "/carrinho/x", clearFiltersHref: "/cotacao/nova?carrinho=x", shareHref: "/escolas/1/ef-1?ano=2027" };

describe("NoStationeries · vazio padrão (revisão UX I4)", () => {
  it("sem filtro: texto de região sem papelaria, compartilhar e voltar, sem 'Tirar filtros'", () => {
    render(<NoStationeries {...props} hasFilter={false} />);
    expect(screen.getByText(/Ainda não há papelaria cadastrada nesta região/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tirar filtros" })).toBeNull();
    expect(screen.getByRole("link", { name: "Compartilhar a lista" })).toHaveAttribute("href", props.shareHref);
    expect(screen.getByRole("link", { name: "Voltar ao carrinho" })).toHaveAttribute("href", "/carrinho/x");
  });

  it("com filtro: texto de filtros e 'Tirar filtros' que limpa a busca", () => {
    render(<NoStationeries {...props} hasFilter />);
    expect(screen.getByText(/com os filtros escolhidos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tirar filtros" })).toHaveAttribute("href", props.clearFiltersHref);
  });

  it("sem como resolver a lista, não oferece compartilhar", () => {
    render(<NoStationeries {...props} hasFilter={false} shareHref={null} />);
    expect(screen.queryByRole("link", { name: "Compartilhar a lista" })).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
