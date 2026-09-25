import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpcaoUnica } from "@/components/pesquisa/OpcaoUnica";
import { CIDADE } from "@/lib/pesquisa/perguntas";

describe("OpcaoUnica", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("é um radiogroup real com uma opção por rótulo", () => {
    render(<OpcaoUnica nomeGrupo="Cidade" opcoes={CIDADE} onEscolher={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Cidade" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(CIDADE.length);
  });

  it("marca a opção na hora e chama onEscolher com o slug certo 250ms depois", () => {
    const onEscolher = vi.fn();
    render(<OpcaoUnica nomeGrupo="Cidade" opcoes={CIDADE} onEscolher={onEscolher} />);

    fireEvent.click(screen.getByRole("radio", { name: "Várzea Grande" }));
    expect(screen.getByRole("radio", { name: "Várzea Grande" })).toHaveAttribute("aria-checked", "true");
    expect(onEscolher).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(onEscolher).toHaveBeenCalledWith("varzea_grande");
  });
});
