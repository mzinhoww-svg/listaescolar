import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";

describe("UX-005 · error.tsx", () => {
  it("diz o que foi salvo, oferece Tentar de novo, início e como falar com a equipe", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("x")} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/não conseguimos carregar/i);
    expect(document.body.textContent).toMatch(/continua salvo/i);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Ir para o início" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Como falar com a equipe" })).toHaveAttribute("href", "/sobre");
  });
});

describe("UX-005 · global-error.tsx", () => {
  it("é um documento em português com a marca, botão Tentar de novo e link ao início", () => {
    const reset = vi.fn();
    const html = render(<GlobalError error={new Error("x")} reset={reset} />, { container: document.documentElement }).container;
    expect(html.getAttribute("lang")).toBe("pt-BR");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/algo deu errado/i);
    expect(html.textContent).toMatch(/ListaCerta/);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Ir para o início" })).toHaveAttribute("href", "/");
  });
});
