import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Tela } from "@/components/pesquisa/Tela";

describe("Tela", () => {
  it("mostra o contador no cabeçalho, o progressbar e foca o título da pergunta", () => {
    render(
      <Tela titulo="Quantos filhos você tem na escola?" progresso={{ atual: 2, total: 12 }}>
        <p>corpo</p>
      </Tela>,
    );
    expect(screen.getByText("2 de 12")).toBeInTheDocument();
    expect(screen.getByText("2 de 12")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "2 de 12");
    expect(
      screen.getByRole("heading", { level: 1, name: "Quantos filhos você tem na escola?" }),
    ).toHaveFocus();
  });

  it("não rouba o foco na tela de boas-vindas (sem progresso)", () => {
    render(<Tela titulo="Como foi comprar a lista de material escolar este ano?" />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("liga Voltar, Continuar e Pular aos handlers e respeita continuarDesabilitado", () => {
    const onVoltar = vi.fn();
    const onContinuar = vi.fn();
    const onPular = vi.fn();
    const { rerender } = render(
      <Tela
        titulo="T"
        progresso={{ atual: 4, total: 12 }}
        onVoltar={onVoltar}
        onContinuar={onContinuar}
        onPular={onPular}
        continuarDesabilitado
      />,
    );
    const continuar = screen.getByRole("button", { name: "Continuar" });
    expect(continuar).toBeDisabled();
    fireEvent.click(continuar);
    expect(onContinuar).not.toHaveBeenCalled();

    rerender(
      <Tela
        titulo="T"
        progresso={{ atual: 4, total: 12 }}
        onVoltar={onVoltar}
        onContinuar={onContinuar}
        onPular={onPular}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(screen.getByRole("button", { name: "Pular" }));
    expect(onContinuar).toHaveBeenCalledTimes(1);
    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(onPular).toHaveBeenCalledTimes(1);
  });

  it("sem ações, não renderiza barra nem botões", () => {
    render(<Tela titulo="T" progresso={{ atual: 1, total: 12 }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
