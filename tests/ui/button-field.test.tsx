import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Button, buttonClass } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { outlineButton, primaryButton } from "@/components/auth/Screen";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

describe("Button", () => {
  it("tem 48 px (md) ou 56 px (lg) e foco em Verde Fundo, nunca Verde Certo", () => {
    expect(buttonClass("primary")).toContain("h-12");
    expect(buttonClass("primary", "lg")).toContain("h-14");
    for (const v of ["primary", "outline", "danger", "whatsapp"] as const) {
      expect(buttonClass(v)).toContain("focus-visible:outline-verde-fundo");
      expect(buttonClass(v)).not.toContain("outline-verde-certo");
    }
    expect(primaryButton).toContain("outline-verde-fundo");
    expect(outlineButton).toContain("outline-verde-fundo");
  });

  it("type=button por padrão e erro usa tokens erro-*", () => {
    render(<Button variant="danger">Excluir</Button>);
    const b = screen.getByRole("button", { name: "Excluir" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toContain("text-erro-texto");
    expect(b.className).not.toMatch(/red-|#8a1c14/);
  });
});

describe("Field", () => {
  it("rótulo associado, erro com alerta e borda de campo", () => {
    render(
      <Field id="email" label="E-mail" error="Informe um e-mail válido.">
        <input id="email" aria-invalid="true" aria-describedby="email-erro" className={fieldInputClass} />
      </Field>,
    );
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Informe um e-mail válido.");
    expect(fieldInputClass).toContain("border-texto-3");
  });

  it("a dica some quando há erro", () => {
    const { rerender } = render(<Field id="a" label="A" hint="Dica"><input id="a" /></Field>);
    expect(screen.getByText("Dica")).toBeTruthy();
    rerender(<Field id="a" label="A" hint="Dica" error="Erro"><input id="a" /></Field>);
    expect(screen.queryByText("Dica")).toBeNull();
  });
});

describe("ConfirmDialog (confirmação destrutiva única)", () => {
  it("abre, cancela e confirma; erro do servidor aparece no diálogo", async () => {
    const onConfirm = vi.fn(async () => ({ ok: false as const, message: "Não deu." }));
    const { container } = render(
      <ConfirmDialog triggerLabel="Revogar" title="Revogar chave" body="Sem volta." confirmLabel="Revogar agora" onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revogar" }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Revogar agora", hidden: true }));
    await waitFor(() => expect(screen.getByRole("alert", { hidden: true }).textContent).toBe("Não deu."));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("sem cor de erro avulsa", () => {
  it("nenhum arquivo de app/ ou components/ usa red-* do Tailwind nem os hex de erro", () => {
    
    const out = execSync(String.raw`grep -rlE "text-red-|bg-red-|border-red-|#fde2e0|#8a1c14" app components || true`, { cwd: join(process.cwd()) }).toString().trim();
    expect(out).toBe("");
    expect(readFileSync(join(process.cwd(), "app/globals.css"), "utf8")).toContain("--erro-texto");
  });
});
