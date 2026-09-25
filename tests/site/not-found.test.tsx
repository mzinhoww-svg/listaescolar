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
});

describe("403", () => {
  it("texto da Sis05 e noindex", () => {
    render(<ForbiddenPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Você não tem acesso a esta página" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar com outra conta" }).getAttribute("href")).toBe("/entrar");
    expect(forbiddenMeta.title).toBe("Erro 403 · ListaCerta");
    expect(forbiddenMeta.robots).toMatchObject({ index: false });
  });
});
