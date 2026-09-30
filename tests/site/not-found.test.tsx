import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ForbiddenPage, { metadata as forbiddenMeta } from "@/app/403/page";
import NotFound, { metadata as notFoundMeta } from "@/app/not-found";

describe("404", () => {
  it("texto da Sis06, Buscar escola -> /escolas e noindex", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Esta página não está na lista" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Buscar escola/ }).getAttribute("href")).toBe("/escolas");
    expect(screen.getByRole("link", { name: "Ir para o início" }).getAttribute("href")).toBe("/");
    expect(notFoundMeta.title).toBe("Página não encontrada · ListaCerta");
    expect(notFoundMeta.robots).toMatchObject({ index: false });
  });
  it("UX-003: sem verde no estado de erro e o 404 não domina o título", () => {
    const { container } = render(<NotFound />);
    expect(container.innerHTML).not.toContain("verde-certo");
    expect(container.innerHTML).not.toContain("text-[120px]");
  });
});

describe("403", () => {
  it("UX-003: título humano, orientação de quem deveria entrar, sem código de erro, e noindex", () => {
    const { container } = render(<ForbiddenPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Sem acesso a esta área" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/erro 403/i);
    expect(container.textContent).toMatch(/entre com a conta certa|peça a quem administra/i);
    expect(screen.getByRole("link", { name: "Entrar com outra conta" }).getAttribute("href")).toBe("/entrar");
    expect(screen.getByRole("link", { name: "Ir para o início" }).getAttribute("href")).toBe("/");
    expect(forbiddenMeta.title).toBe("Sem acesso · ListaCerta");
    expect(forbiddenMeta.robots).toMatchObject({ index: false });
  });
});
