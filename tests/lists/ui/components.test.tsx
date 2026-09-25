import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatListDate, formatQuantity, itemCountLabel } from "@/components/lists/format";
import { ItemsTable } from "@/components/lists/ItemsTable";
import { ListHeader } from "@/components/lists/ListHeader";
import { UnpublishedState } from "@/components/lists/UnpublishedState";
import { VersionHistory } from "@/components/lists/VersionHistory";
import type { PublicListItem, PublicListVersionSummary } from "@/features/lists/types";

const item = (over: Partial<PublicListItem> = {}): PublicListItem => ({
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b",
  position: 1,
  name: "Caderno brochura 96 folhas",
  normalizedName: "caderno brochura 96 folhas",
  category: "Papelaria",
  quantity: 2,
  unit: "un",
  ...over,
});
const ver = (n: number, status: "published" | "superseded"): PublicListVersionSummary => ({
  id: `3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a0${n}`,
  versionNumber: n,
  status,
  publishedAt: "2027-01-10T15:00:00Z",
  itemCount: n === 1 ? 1 : 3,
});

describe("format", () => {
  it("data no fuso de Cuiabá, quantidade em pt-BR e plural", () => {
    expect(formatListDate("2027-01-10T02:00:00Z")).toBe("09/01/2027");
    expect(formatListDate("lixo")).toBe("indisponível");
    expect(formatQuantity(12.5, "kg")).toBe("12,5 kg");
    expect(formatQuantity(3, null)).toBe("3");
    expect(formatQuantity(null, null)).toBeNull();
    expect(formatQuantity(null, "cx")).toBeNull();
    expect(itemCountLabel(1)).toBe("1 item");
    expect(itemCountLabel(4)).toBe("4 itens");
  });
});

describe("ListHeader", () => {
  it("publicada: escola, série/ano, chips e selo de demonstração", () => {
    render(
      <ListHeader
        schoolName="Escola X"
        inep="99001001"
        gradeLabel="5º ano"
        year={2027}
        isDemo
        version={{ number: 2, publishedAt: "2027-01-10T15:00:00Z", itemCount: 4 }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Escola X" })).toBeInTheDocument();
    expect(screen.getByText("Lista publicada")).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    expect(screen.getByText("5º ano · Ano letivo 2027")).toBeInTheDocument();
    const chips = within(screen.getByRole("list", { name: "Resumo da lista" }));
    expect(chips.getByText("4 itens")).toBeInTheDocument();
    expect(chips.getByText("Versão 2")).toBeInTheDocument();
    expect(chips.getByText("Atualizada 10/01/2027")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para o perfil/ })).toHaveAttribute(
      "href",
      "/escolas/99001001",
    );
  });
  it("não publicada: sem chips e sem selo demo quando não é demo", () => {
    render(
      <ListHeader schoolName="Escola X" inep="1" gradeLabel="5º ano" year={2027} isDemo={false} />,
    );
    expect(screen.getByText("Lista não publicada")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Resumo da lista" })).toBeNull();
    expect(screen.queryByText("Demonstração")).toBeNull();
  });
});

describe("ItemsTable", () => {
  it("mostra nome, quantidade, categoria; sem quantidade vira traço acessível; nunca preço inventado", () => {
    render(
      <ItemsTable
        items={[
          item(),
          item({
            id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6c",
            name: "Régua",
            category: null,
            quantity: null,
            unit: null,
          }),
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("2 un")).toBeInTheDocument();
    expect(screen.getByText("Papelaria")).toBeInTheDocument();
    expect(screen.getByText("quantidade não informada")).toBeInTheDocument();
    expect(screen.getByText(/Preço e estoque: indisponível/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/R\$/);
  });
});

describe("VersionHistory", () => {
  it("some com uma versão só; com duas rotula atual e versão anterior", () => {
    const { container, rerender } = render(<VersionHistory versions={[ver(1, "published")]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<VersionHistory versions={[ver(2, "published"), ver(1, "superseded")]} />);
    expect(screen.getByText("Versão 2 · atual")).toBeInTheDocument();
    expect(screen.getByText("Versão 1 · versão anterior")).toBeInTheDocument();
  });
});

describe("UnpublishedState", () => {
  it("informa lista não publicada e volta ao perfil", () => {
    render(<UnpublishedState inep="99001001" gradeLabel="3º ano" year={2027} />);
    expect(screen.getByText("3º ano · 2027: lista não publicada")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("link", { name: "Escolher outra série" })).toHaveAttribute(
      "href",
      "/escolas/99001001",
    );
  });
});
