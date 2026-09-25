import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, refresh: vi.fn() }),
}));

import { GradeYearPicker } from "@/app/escolas/[inep]/GradeYearPicker";

describe("GradeYearPicker", () => {
  it("pede ao servidor a lista real via router.replace ao trocar série e ano", () => {
    render(<GradeYearPicker inep="51001234" serie={null} ano={null} years={[2026, 2027]} />);
    expect(screen.getByText("Escolha a série para ver a lista")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "ef-4" } });
    fireEvent.change(screen.getByLabelText("Ano letivo"), { target: { value: "2027" } });
    expect(routerReplace).toHaveBeenLastCalledWith("?serie=ef-4&ano=2027", { scroll: false });
    expect(screen.getByText(/Consultando/)).toBeInTheDocument();
  });

  it("com lista publicada mostra versão, itens e o link para a página da lista", () => {
    render(
      <GradeYearPicker
        inep="51001234"
        serie="ef-4"
        ano={2027}
        years={[2026, 2027]}
        published={{ versionNumber: 2, itemCount: 12 }}
      />,
    );
    expect(screen.getByText("4º ano · 2027: lista publicada")).toBeInTheDocument();
    expect(screen.getByText("Versão 2 · 12 itens")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver lista" })).toHaveAttribute(
      "href",
      "/escolas/51001234/ef-4?ano=2027",
    );
  });

  it("trocar a série não mostra versão, itens nem link da série anterior", () => {
    render(
      <GradeYearPicker
        inep="51001234"
        serie="ef-4"
        ano={2027}
        years={[2026, 2027]}
        published={{ versionNumber: 2, itemCount: 12 }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "ef-5" } });
    expect(screen.queryByText("Versão 2 · 12 itens")).toBeNull();
    expect(screen.queryByText(/lista publicada/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver lista" })).toBeNull();
    expect(screen.queryByText(/lista não publicada/)).toBeNull();
    expect(screen.getByText(/Consultando/)).toBeInTheDocument();
  });

  it("trocar só o ano também descarta a lista do ano anterior", () => {
    render(
      <GradeYearPicker
        inep="51001234"
        serie="ef-4"
        ano={2026}
        years={[2026, 2027]}
        published={{ versionNumber: 2, itemCount: 12 }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Ano letivo"), { target: { value: "2027" } });
    expect(screen.queryByText("Versão 2 · 12 itens")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver lista" })).toBeNull();
  });

  it("parte da seleção vinda da URL e o form (sem JS) usa GET no perfil", () => {
    const { container } = render(
      <GradeYearPicker inep="51001234" serie="em-2" ano={2027} years={[2026, 2027]} />,
    );
    expect(screen.getByLabelText("Série")).toHaveValue("em-2");
    expect(screen.getByLabelText("Ano letivo")).toHaveValue("2027");
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/escolas/51001234");
  });
});
