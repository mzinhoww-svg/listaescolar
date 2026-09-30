// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const setNotify = vi.fn();
vi.mock("@/app/enviar-lista/[submissionId]/actions", () => ({ setNotifyAction: (p: unknown, f: FormData) => setNotify(p, f) }));

import { AsyncOptions } from "@/components/submissions/AsyncOptions";

const ID = "11111111-1111-4111-8111-111111111111";

describe("UX-066 · o que a tela diz depois de escolher um canal", () => {
  it("navegador: não afirma aviso; manda voltar aqui ou a Meus envios", async () => {
    setNotify.mockResolvedValue({ status: "saved", channel: "browser" });
    render(<AsyncOptions submissionId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Ativar notificação do navegador" }));
    const msg = await screen.findByText(/Preferência registrada/);
    expect(msg).toHaveTextContent("Ainda não enviamos aviso pelo navegador");
    expect(msg).toHaveTextContent("Meus envios");
  });
  it("e-mail: não promete 'vamos avisar'", async () => {
    setNotify.mockResolvedValue({ status: "saved", channel: "email" });
    render(<AsyncOptions submissionId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Avisar por este canal" }));
    const msg = await screen.findByText(/Canal registrado/);
    expect(msg.textContent).not.toMatch(/vamos avisar/i);
    expect(msg).toHaveTextContent("Meus envios");
  });
});
