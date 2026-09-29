// D-006: aprovar reivindicação é terminal e imediato; pede confirmação no diálogo único do produto antes de enviar.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ActionForm } from "@/components/claims/ActionForm";
import { IDLE, type ClaimActionState } from "@/features/claims/form-state";

beforeAll(() => {
  // jsdom não implementa <dialog>: simula abrir/fechar.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

const idle = async (_prev: ClaimActionState, _fd: FormData) => IDLE;

describe("ActionForm confirmMessage (D-006)", () => {
  it("sem confirmMessage: envia normalmente, sem diálogo", async () => {
    const action = vi.fn(idle);
    const { container } = render(<ActionForm action={action} submitLabel="Aprovar" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("com confirmMessage: clicar só abre o diálogo; cancelar impede o envio", async () => {
    const action = vi.fn(idle);
    const { container } = render(<ActionForm action={action} submitLabel="Aprovar" confirmMessage="Confirmar?" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("Confirmar?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar", hidden: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(action).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  });

  it("com confirmMessage: confirmar no diálogo deixa a action rodar", async () => {
    const action = vi.fn(idle);
    render(<ActionForm action={action} submitLabel="Aprovar" confirmMessage="Confirmar?" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    const buttons = screen.getAllByRole("button", { name: "Aprovar", hidden: true });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
