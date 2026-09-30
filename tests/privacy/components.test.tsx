// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/conta/privacidade/actions", () => ({ revokeConsentAction: vi.fn(), deleteAccountAction: vi.fn() }));

import { ConsentsList } from "@/components/privacy/ConsentsList";
import { DeleteAccountForm } from "@/components/privacy/DeleteAccountForm";
import { PRIVACY_COPY } from "@/features/privacy/copy";

const consent = { id: "c1", purpose: "list_upload", granted_at: "2026-09-01T00:00:00Z", text_version: "v1", revoked_at: null };

describe("ConsentsList · UX-052", () => {
  it("'Revogar' abre ConfirmDialog com verbo + objeto; o botão que revoga fica dentro do diálogo", () => {
    render(<ConsentsList consents={[consent] as never} />);
    const trigger = screen.getByRole("button", { name: "Revogar consentimento de envio de lista escolar" });
    const dialog = document.querySelector("dialog") as HTMLElement;
    expect(dialog.getAttribute("open")).toBeNull();
    fireEvent.click(trigger);
    expect(within(dialog).getByRole("heading")).toHaveTextContent(/Revogar/);
    expect(within(dialog).getByText(/Isto não desfaz o envio já feito/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Revogar agora" })).toBeInTheDocument();
    for (const b of screen.queryAllByRole("button", { name: /^Revogar$/ })) expect(b.closest("dialog")).not.toBeNull();
  });

  it("vazio diz o que fazer, sem inventar consentimento", () => {
    render(<ConsentsList consents={[]} />);
    expect(screen.getByText(/Nenhum consentimento registrado ainda/)).toBeInTheDocument();
  });
});

describe("texto da exclusão · UX-057", () => {
  it("parágrafo curto, sem jargão da equipe", () => {
    const t = PRIVACY_COPY.deleteAccount;
    expect(t.length).toBeLessThanOrEqual(420);
    for (const banned of [/estudantes/i, /JSON/, /B2B/, /revisão administrativa/i, /escola de escola/i]) expect(t).not.toMatch(banned);
    expect(t).toMatch(/alunos/);
    expect(t).toMatch(/não tem volta/i);
  });
  it("botão de exportação não fala em JSON e a política tem nome de marca", () => {
    expect(PRIVACY_COPY.exportButton).toBe("Baixar meus dados");
    expect(PRIVACY_COPY.policyLink).toBe("Política de Privacidade");
  });
});

describe("DeleteAccountForm · UX-057", () => {
  it("a palavra digitada continua no campo depois do erro", async () => {
    const { deleteAccountAction } = await import("@/app/conta/privacidade/actions");
    vi.mocked(deleteAccountAction).mockResolvedValue({ status: "error", message: 'Digite "excluir" para confirmar.' });
    render(<DeleteAccountForm />);
    const input = screen.getByLabelText(/Digite/);
    fireEvent.change(input, { target: { value: "exclui" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir minha conta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Digite/);
    expect(screen.getByLabelText(/Digite/)).toHaveValue("exclui");
  });
});
