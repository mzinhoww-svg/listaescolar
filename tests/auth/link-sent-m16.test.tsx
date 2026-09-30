// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkSent } from "@/app/entrar/LinkSent";
import { LoginForm } from "@/app/entrar/LoginForm";

const props = { email: "a@b.com", next: "/", pending: false, resend: () => {}, onChangeEmail: () => {} };

describe("LinkSent · mitigação do M16 (D-163)", () => {
  it("depois do envio orienta a abrir o link no navegador do celular quando o acesso não funcionar dentro de outro app", () => {
    render(<LinkSent {...props} />);
    expect(screen.getByText(/abra o link no navegador do celular/)).toBeInTheDocument();
  });

  it("a orientação tem 14 px ou mais (UX-042)", () => {
    render(<LinkSent {...props} />);
    const p = screen.getByText(/abra o link no navegador do celular/);
    expect(p.className).not.toMatch(/text-\[1[0-3]px\]|text-xs/);
  });

  it("a mesma orientação aparece ANTES do envio, na tela do formulário", () => {
    render(<LoginForm next="/conta" />);
    const note = screen.getByText(/abra o e-mail neste aparelho/i);
    expect(note.textContent).toMatch(/WhatsApp/);
    expect(note.textContent).toMatch(/navegador/);
    expect(note.className).not.toMatch(/text-\[1[0-3]px\]|text-xs/);
  });
});

describe("LinkSent · reenvio acessível (UX-046)", () => {
  it("nenhuma região viva contém o número da contagem", () => {
    const { container } = render(<LinkSent {...props} />);
    const live = [...container.querySelectorAll('[aria-live], [role="status"]')];
    expect(live.length).toBeGreaterThan(0);
    for (const el of live) expect(el.textContent ?? "").not.toMatch(/\d+\s*s\b/);
  });

  it("o botão desabilitado mostra a contagem e não usa opacity-60 (contraste do sistema)", () => {
    render(<LinkSent {...props} />);
    const b = screen.getByRole("button", { name: /Reenviar link em 30 s/ });
    expect(b).toBeDisabled();
    expect(b.className).not.toContain("opacity-60");
    expect(b.className).toContain("disabled:opacity-100");
    expect(b.className).toContain("disabled:text-texto-2");
  });

  it("o anúncio para leitor de tela só diz que o reenvio ainda não está liberado sem número", () => {
    const { container } = render(<LinkSent {...props} />);
    const sr = container.querySelector("p.sr-only");
    expect(sr).not.toBeNull();
    expect(sr?.textContent).toBe("");
  });
});
