// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConsentNotice } from "@/components/analytics/ConsentNotice";

describe("ConsentNotice (revisão UX I6)", () => {
  it("Aceitar e Recusar têm exatamente a mesma variante visual", () => {
    render(<ConsentNotice onAccept={() => {}} onDeny={() => {}} />);
    const accept = screen.getByRole("button", { name: "Aceitar" });
    const deny = screen.getByRole("button", { name: "Recusar" });
    expect(accept.className).toBe(deny.className);
  });

  it("cada botão chama a sua ação", () => {
    const onAccept = vi.fn();
    const onDeny = vi.fn();
    render(<ConsentNotice onAccept={onAccept} onDeny={onDeny} />);
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("não afirma que o navegador fica sem identificador", () => {
    const { container } = render(<ConsentNotice onAccept={() => {}} onDeny={() => {}} />);
    expect(container.textContent).not.toContain("sem identificar você");
  });

  it("UX-011: texto de 14 px, sem sombra, sobreposição fixa no topo (sem empurrar conteúdo nem cobrir ações fixas de baixo)", () => {
    render(<ConsentNotice onAccept={() => {}} onDeny={() => {}} />);
    const region = screen.getByRole("region", { name: "Medição de uso" });
    expect(region.className).toMatch(/\bfixed\b/);
    expect(region.className).toContain("top-0");
    expect(region.className).not.toMatch(/bottom-|shadow-|order-first/);
    expect(region.className).toContain("env(safe-area-inset-top)");
    // Entrada só com opacidade/transform, pelo token, e só com movimento permitido.
    expect(region.className).toContain("motion-safe:animate-[offline-in_var(--mov-base)");
    const text = region.querySelector("p")!;
    expect(text.className).toContain("text-[14px]");
    expect(text.className).not.toContain("text-[13px]");
  });
});
