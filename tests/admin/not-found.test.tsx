import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AdminNotFound from "@/app/admin/not-found";

describe("admin not-found (UX-115)", () => {
  it("explica em texto da equipe e leva de volta às filas", () => {
    render(<AdminNotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Registro não encontrado");
    expect(screen.getByRole("link", { name: "Voltar à visão geral" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Ver a fila de revisão" })).toHaveAttribute("href", "/admin/revisao");
  });
});
