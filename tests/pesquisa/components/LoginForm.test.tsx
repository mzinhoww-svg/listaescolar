import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { LoginForm } from "@/components/pesquisa/resultados/LoginForm";

function preencherEEnviar(senha: string) {
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: senha } });
  fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("senha correta (200): chama /api/pesquisa/login e navega para os resultados", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm />);
    preencherEEnviar("senha-correta");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/pesquisa/resultados"));
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/pesquisa/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ senha: "senha-correta" }),
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it('senha incorreta (401): mostra "Senha incorreta." e não navega', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, json: async () => ({ error: "invalid_password" }) }),
    );
    render(<LoginForm />);
    preencherEEnviar("senha-errada");

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha incorreta.");
    expect(push).not.toHaveBeenCalled();
  });

  it("erro inesperado (5xx): mostra mensagem genérica", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, json: async () => ({}) }));
    render(<LoginForm />);
    preencherEEnviar("qualquer-coisa");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível entrar. Tente de novo.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("falha de rede: mostra mensagem genérica sem lançar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<LoginForm />);
    preencherEEnviar("qualquer-coisa");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível entrar. Tente de novo.",
    );
  });

  it('desabilita o botão e mostra "Entrando…" enquanto a requisição está pendente', async () => {
    let resolver: (v: { status: number; json: () => Promise<unknown> }) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolver = resolve;
        }),
      ),
    );
    render(<LoginForm />);
    preencherEEnviar("qualquer-coisa");

    const botao = await screen.findByRole("button", { name: "Entrando…" });
    expect(botao).toBeDisabled();

    resolver({ status: 200, json: async () => ({ ok: true }) });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});
