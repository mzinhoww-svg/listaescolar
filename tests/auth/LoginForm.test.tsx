import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithMagicLink = vi.fn();
vi.mock("@/features/auth/actions", () => ({
  signInWithMagicLink: (f: FormData) => signInWithMagicLink(f),
  signInWithGoogle: vi.fn(),
}));

import { LoginForm } from "@/app/entrar/LoginForm";
import { LoginIntro } from "@/app/entrar/LoginIntro";

function submit(email: string) {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /link por e-mail/i }));
}

describe("LoginForm", () => {
  beforeEach(() => signInWithMagicLink.mockReset());

  it("mostra erro para e-mail inválido sem chamar a action", async () => {
    render(<LoginForm next="/conta" />);
    submit("nao-e-email");
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe um e-mail válido.");
    expect(signInWithMagicLink).not.toHaveBeenCalled();
  });

  it("depois de enviado mostra o e-mail digitado e trava o reenvio por 30 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      signInWithMagicLink.mockResolvedValue({ status: "sent", message: "Verifique seu e-mail.", email: "a@b.co" });
      render(<LoginForm next="/conta" />);
      submit("A@b.co");
      expect(await screen.findByText(/Enviamos o link para/, undefined, { timeout: 8000 })).toHaveTextContent("a@b.co");
      expect(screen.getByText(/Abra o e-mail neste aparelho/)).toBeInTheDocument();
      const resend = screen.getByRole("button", { name: /Reenviar link/ });
      expect(resend).toBeDisabled();
      for (let i = 0; i < 30; i += 1) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
      }
      await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar link" })).toBeEnabled(), { timeout: 8000 });
      fireEvent.click(screen.getByRole("button", { name: "Reenviar link" }));
      await waitFor(() => expect(signInWithMagicLink).toHaveBeenCalledTimes(2), { timeout: 8000 });
      const second = signInWithMagicLink.mock.calls[1]?.[0] as FormData;
      expect(second.get("email")).toBe("a@b.co");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Trocar e-mail volta ao formulário com o campo vazio", async () => {
    signInWithMagicLink.mockResolvedValue({ status: "sent", message: "Verifique seu e-mail.", email: "a@b.co" });
    render(<LoginForm next="/conta" />);
    submit("a@b.co");
    await screen.findByText(/Enviamos o link para/);
    fireEvent.click(screen.getByRole("button", { name: "Trocar e-mail" }));
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
    expect(screen.getByRole("button", { name: /link por e-mail/i })).toBeEnabled();
  });

  it("após erro de rate limit mantém o e-mail, sem aria-invalid", async () => {
    signInWithMagicLink.mockResolvedValue({
      status: "error",
      message: "Aguarde um minuto para pedir outro link.",
      email: "a@b.co",
    });
    render(<LoginForm next="/conta" />);
    submit("a@b.co");
    await screen.findByRole("alert");
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveValue("a@b.co");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveAttribute("aria-describedby", "email-msg");
  });

  it("e-mail inválido: mantém o texto digitado e marca aria-invalid", async () => {
    render(<LoginForm next="/conta" />);
    submit("nao-e-email");
    await screen.findByRole("alert");
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveValue("nao-e-email");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("mostra a mensagem de rate limit", async () => {
    signInWithMagicLink.mockResolvedValue({
      status: "error",
      message: "Aguarde um minuto para pedir outro link.",
    });
    render(<LoginForm next="/conta" />);
    submit("a@b.co");
    expect(await screen.findByRole("alert")).toHaveTextContent("Aguarde um minuto");
  });

  it("desabilita o botão durante o envio", async () => {
    let resolve: (v: { status: "sent" }) => void = () => {};
    signInWithMagicLink.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LoginForm next="/conta" />);
    submit("a@b.co");
    const btn = await screen.findByRole("button", { name: "Enviando…" });
    expect(btn).toBeDisabled();
    resolve({ status: "sent" });
    await waitFor(() => expect(screen.getByText(/Enviamos o link para/)).toBeInTheDocument());
  });
});

describe("LoginIntro", () => {
  it("com next de carrinho o título menciona carrinho", () => {
    render(<LoginIntro next="/carrinho/novo?lista=x" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/carrinho/i);
  });
  it("sem contexto mantém o título padrão", () => {
    render(<LoginIntro next="/conta" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Entre para acompanhar a lista de cada aluno");
  });
});
