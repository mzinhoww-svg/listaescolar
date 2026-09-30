// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SkipLink } from "@/components/site/SkipLink";
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

  it("2.4.11: scroll-padding-top de html = altura medida do aviso enquanto aberto; removido ao fechar", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 132.4 } as DOMRect);
    const { unmount } = render(<ConsentNotice onAccept={() => {}} onDeny={() => {}} />);
    expect(document.documentElement.style.scrollPaddingTop).toBe("133px");
    unmount();
    expect(document.documentElement.style.scrollPaddingTop).toBe("");
    spy.mockRestore();
  });

  it("anuncia o aviso num role=status educado, sem mover o foco", async () => {
    const before = document.activeElement;
    render(<ConsentNotice onAccept={() => {}} onDeny={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe(""); // a região existe vazia e o texto entra depois, para ser anunciado
    await waitFor(() => expect(status.textContent).toMatch(/Aceitar ou Recusar/));
    expect(status.className).toContain("sr-only");
    expect(document.activeElement).toBe(before);
  });

  it("o link de pular fica acima do aviso ao receber foco (z-index maior)", () => {
    render(
      <>
        <SkipLink />
        <ConsentNotice onAccept={() => {}} onDeny={() => {}} />
      </>,
    );
    const z = (cls: string, re: RegExp) => Number(re.exec(cls)?.[1]);
    const skip = z(screen.getByRole("link", { name: "Pular para o conteúdo" }).className, /focus:z-\[(\d+)\]/);
    const notice = z(screen.getByRole("region", { name: "Medição de uso" }).className, /\bz-(\d+)\b/);
    expect(skip).toBeGreaterThan(notice);
  });
});
