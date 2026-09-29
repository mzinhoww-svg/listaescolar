import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonClass } from "@/components/ui/Button";

describe("Button (S29)", () => {
  it("loading desabilita, anuncia e ignora toque duplo", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Pedir cotação</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Pedir cotação" }));
    rerender(
      <Button onClick={onClick} loading>
        Pedir cotação
      </Button>,
    );
    const b = screen.getByRole("button", { name: /Pedir cotação/ });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("variante icon exige nome acessível e avisa em desenvolvimento quando falta", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Button variant="icon" aria-label="Fechar menu">
        ×
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Fechar menu" })).toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
    render(<Button variant="icon">×</Button>);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it("variante text tem alvo mínimo de 44 px e icon é 44 x 44", () => {
    render(<Button variant="text">Ver todos</Button>);
    expect(screen.getByRole("button").className).toMatch(/min-h-11|h-11|h-12/);
    expect(buttonClass("icon")).toContain("h-11 w-11");
    expect(buttonClass("icon")).not.toContain("px-6");
  });
  it("mantém rounded-botao na base de todas as variantes", () => {
    for (const v of ["primary", "outline", "text", "danger", "icon", "whatsapp"] as const) {
      expect(buttonClass(v)).toContain("rounded-botao");
    }
  });
});
