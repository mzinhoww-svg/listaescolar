// D-006: aprovar reivindicação é terminal e imediato; pede confirmação do navegador antes de enviar.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActionForm } from "@/components/claims/ActionForm";
import { IDLE, type ClaimActionState } from "@/features/claims/form-state";

describe("ActionForm confirmMessage (D-006)", () => {
  it("sem confirmMessage: envia normalmente, sem perguntar nada", async () => {
    const action = vi.fn(async (_prev: ClaimActionState, _fd: FormData) => IDLE);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<ActionForm action={action} submitLabel="Aprovar" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("com confirmMessage: cancelar impede o envio (a action nunca roda)", async () => {
    const action = vi.fn(async (_prev: ClaimActionState, _fd: FormData) => IDLE);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ActionForm action={action} submitLabel="Aprovar" confirmMessage="Confirmar?" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(confirmSpy).toHaveBeenCalledWith("Confirmar?");
    await new Promise((r) => setTimeout(r, 10));
    expect(action).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("com confirmMessage: confirmar deixa a action rodar", async () => {
    const action = vi.fn(async (_prev: ClaimActionState, _fd: FormData) => IDLE);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ActionForm action={action} submitLabel="Aprovar" confirmMessage="Confirmar?" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(confirmSpy).toHaveBeenCalledWith("Confirmar?");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });
});
