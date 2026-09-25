import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Progresso } from "@/components/pesquisa/Progresso";

describe("Progresso", () => {
  it("é um progressbar com valor, máximo e texto legível", () => {
    render(<Progresso atual={7} total={12} />);
    const barra = screen.getByRole("progressbar", { name: "Progresso da pesquisa" });
    expect(barra).toHaveAttribute("aria-valuemin", "0");
    expect(barra).toHaveAttribute("aria-valuemax", "12");
    expect(barra).toHaveAttribute("aria-valuenow", "7");
    expect(barra).toHaveAttribute("aria-valuetext", "7 de 12");
  });

  it("preenche a largura proporcional ao progresso, limitada a 0-100%", () => {
    const { container, rerender } = render(<Progresso atual={6} total={12} />);
    const preenchimento = () => container.querySelector("[role=progressbar] > div") as HTMLElement;
    expect(preenchimento().style.width).toBe("50%");
    rerender(<Progresso atual={20} total={12} />);
    expect(preenchimento().style.width).toBe("100%");
  });
});
