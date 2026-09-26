import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OpcaoMultipla } from "@/components/pesquisa/OpcaoMultipla";
import { DORES, DORES_MAX_SELECIONADAS } from "@/lib/pesquisa/perguntas";

describe("OpcaoMultipla", () => {
  it("chama onAlternar com o slug marcado/desmarcado", () => {
    const onAlternar = vi.fn();
    render(
      <OpcaoMultipla
        nomeGrupo="Dores"
        opcoes={DORES}
        valoresSelecionados={[]}
        onAlternar={onAlternar}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Preço alto" }));
    expect(onAlternar).toHaveBeenCalledWith("preco_alto");
  });

  it("respeita o máximo (tela 10): não deixa marcar a 3ª opção", () => {
    const onAlternar = vi.fn();
    const jaSelecionadas = [DORES[0].slug, DORES[1].slug];
    render(
      <OpcaoMultipla
        nomeGrupo="Dores"
        opcoes={DORES}
        valoresSelecionados={jaSelecionadas}
        max={DORES_MAX_SELECIONADAS}
        onAlternar={onAlternar}
      />,
    );
    const terceira = screen.getByRole("checkbox", { name: DORES[2].rotulo });
    expect(terceira).toBeDisabled();
    fireEvent.click(terceira);
    expect(onAlternar).not.toHaveBeenCalled();

    // já marcadas continuam clicáveis (permite desmarcar mesmo no máximo)
    const primeira = screen.getByRole("checkbox", { name: DORES[0].rotulo });
    expect(primeira).not.toBeDisabled();
  });
});
