// D-084 (S18): "continuar aguardando" já tinha o botão "Ativar notificação do navegador" (S11), mas não apontava
// para onde a família gerencia/confirma os avisos já ativados (/conta/notificacoes).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AsyncOptions } from "@/components/submissions/AsyncOptions";

describe("AsyncOptions", () => {
  it("linka para /conta/notificacoes (D-084)", () => {
    render(<AsyncOptions submissionId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByRole("link", { name: "Gerenciar avisos em Minha conta" })).toHaveAttribute("href", "/conta/notificacoes");
  });

  it("ainda oferece 'Ativar notificação do navegador' e 'Continuar aguardando'", () => {
    render(<AsyncOptions submissionId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByRole("button", { name: "Ativar notificação do navegador" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar aguardando" })).toBeInTheDocument();
  });
});
