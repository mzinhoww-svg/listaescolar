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

  it("UX-011: texto de 14 px, sem sombra decorativa e fora do rodapé fixo (não cobre 'Começar' nem outras ações fixas)", () => {
    render(<ConsentNotice onAccept={() => {}} onDeny={() => {}} />);
    const region = screen.getByRole("region", { name: "Medição de uso" });
    expect(region.className).not.toMatch(/\bfixed\b|shadow-|bottom-0/);
    expect(region.className).toContain("order-first");
    const text = region.querySelector("p")!;
    expect(text.className).toContain("text-[14px]");
    expect(text.className).not.toContain("text-[13px]");
  });
});
