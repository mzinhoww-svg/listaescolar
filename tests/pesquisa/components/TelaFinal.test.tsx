import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelaFinal } from "@/components/pesquisa/TelaFinal";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";

describe("TelaFinal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('botão "Quero receber" fica desabilitado com WhatsApp incompleto ou checkbox desmarcado', () => {
    render(<TelaFinal sessionId={SESSION_ID} />);
    const botao = screen.getByRole("button", { name: "Quero receber" });
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "6599999" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(botao).toBeDisabled();
  });

  it("habilita só com WhatsApp completo (11 dígitos) e checkbox marcado", () => {
    render(<TelaFinal sessionId={SESSION_ID} />);
    const botao = screen.getByRole("button", { name: "Quero receber" });

    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "65999991234" } });
    expect(botao).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(botao).not.toBeDisabled();
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("(65) 99999-1234");
  });

  it("DDD inválido mantém o botão desabilitado mesmo com 11 dígitos e consentimento", () => {
    render(<TelaFinal sessionId={SESSION_ID} />);
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "00999991234" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Quero receber" })).toBeDisabled();
  });

  it("falha definitiva do /lead mantém o formulário e avisa, em vez de mostrar sucesso", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid" }) }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<TelaFinal sessionId={SESSION_ID} />);
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "65999991234" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Quero receber" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Não conseguimos salvar seu WhatsApp agora. Confira o número e tente de novo.",
      ),
    );
    expect(
      screen.queryByText("Pronto! Ajude outra mãe a economizar tempo."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quero receber" })).not.toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('"Agora não" pula o cadastro e mostra o agradecimento sem chamar /lead', () => {
    render(<TelaFinal sessionId={SESSION_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.getByText("Pronto! Ajude outra mãe a economizar tempo.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("jaConcluida mostra direto o agradecimento, sem formulário de cadastro", () => {
    render(<TelaFinal sessionId={SESSION_ID} jaConcluida />);
    expect(screen.queryByRole("button", { name: "Quero receber" })).not.toBeInTheDocument();
    expect(screen.getByText("Pronto! Ajude outra mãe a economizar tempo.")).toBeInTheDocument();
  });
});
