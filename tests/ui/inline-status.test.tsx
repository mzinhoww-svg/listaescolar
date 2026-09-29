import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InlineStatus } from "@/components/ui/InlineStatus";

describe("InlineStatus (S29)", () => {
  it("sucesso e info usam role=status", () => {
    render(<InlineStatus tone="success">Lista salva</InlineStatus>);
    render(<InlineStatus tone="info">Aguardando</InlineStatus>);
    expect(screen.getByText("Lista salva")).toHaveAttribute("role", "status");
    expect(screen.getByText("Aguardando")).toHaveAttribute("role", "status");
  });
  it("erro usa role=alert e tokens erro-*", () => {
    render(<InlineStatus tone="error">Não foi possível salvar</InlineStatus>);
    const el = screen.getByRole("alert");
    expect(el).toHaveClass("bg-erro-fundo", "text-erro-texto");
  });
});
