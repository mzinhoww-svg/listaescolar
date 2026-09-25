import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PerguntaUsariaCanal } from "@/components/pesquisa/PerguntaUsariaCanal";

describe("PerguntaUsariaCanal (tela 11)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('revela "canal" quando usaria != "nao" e envia os dois campos', () => {
    const onResponder = vi.fn();
    render(<PerguntaUsariaCanal step={11} onResponder={onResponder} onVoltar={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Com certeza" }));
    act(() => vi.advanceTimersByTime(250));
    expect(onResponder).not.toHaveBeenCalled();

    expect(screen.getByText("E onde preferiria comprar?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Tanto faz" }));
    act(() => vi.advanceTimersByTime(250));
    expect(onResponder).toHaveBeenCalledWith(11, { usaria: "com_certeza", canal: "tanto_faz" });
  });

  it('não revela "canal" quando usaria == "nao" e envia só usaria', () => {
    const onResponder = vi.fn();
    render(<PerguntaUsariaCanal step={11} onResponder={onResponder} onVoltar={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Não" }));
    act(() => vi.advanceTimersByTime(250));

    expect(screen.queryByText("E onde preferiria comprar?")).not.toBeInTheDocument();
    expect(onResponder).toHaveBeenCalledWith(11, { usaria: "nao" });
  });
});
