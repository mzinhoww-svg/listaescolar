import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithMagicLink = vi.fn();
vi.mock("@/features/auth/actions", () => ({
  signInWithMagicLink: (f: FormData) => signInWithMagicLink(f),
  signInWithGoogle: vi.fn(),
}));

import { LoginForm } from "@/app/entrar/LoginForm";

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

  it("mostra o estado enviado", async () => {
    signInWithMagicLink.mockResolvedValue({ status: "sent", message: "Verifique seu e-mail." });
    render(<LoginForm next="/conta" />);
    submit("a@b.co");
    expect(await screen.findByText("Verifique seu e-mail.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar link" })).toBeEnabled();
  });

  it("após enviado mantém o e-mail e o reenvio dispara a action", async () => {
    signInWithMagicLink.mockResolvedValue({
      status: "sent",
      message: "Verifique seu e-mail.",
      email: "a@b.co",
    });
    render(<LoginForm next="/conta" />);
    submit("A@b.co");
    await screen.findByText("Verifique seu e-mail.");
    expect(screen.getByLabelText("E-mail")).toHaveValue("a@b.co");
    fireEvent.click(screen.getByRole("button", { name: "Reenviar link" }));
    await waitFor(() => expect(signInWithMagicLink).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const second = signInWithMagicLink.mock.calls[1]?.[0] as FormData;
    expect(second.get("email")).toBe("a@b.co");
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar link" })).toBeEnabled());
  });
});
