import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("é um status com texto Carregando… e blocos ocultos ao leitor de tela", () => {
    const { container } = render(<Skeleton />);
    const s = screen.getByRole("status");
    expect(s.getAttribute("aria-busy")).toBe("true");
    expect(s.textContent).toBe("Carregando…");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(3);
  });

  it("reserva altura em cada bloco e respeita movimento reduzido", () => {
    const { container } = render(<Skeleton blocks={["h-10", "h-64"]} />);
    const blocks = [...container.querySelectorAll('[aria-hidden="true"]')];
    expect(blocks.map((b) => b.className)).toEqual([expect.stringContaining("h-10"), expect.stringContaining("h-64")]);
    for (const b of blocks) {
      expect(b.className).toContain("animate-pulse");
      expect(b.className).toContain("motion-reduce:animate-none");
    }
  });

  it("aceita rótulo próprio", () => {
    render(<Skeleton label="Carregando a lista…" />);
    expect(screen.getByRole("status").textContent).toBe("Carregando a lista…");
  });
});

describe("UX-004 · carregando padrão das árvores privadas", () => {
  it("PageLoading é um esqueleto com role=status, aria-busy, altura reservada e sem spinner de tela cheia", async () => {
    const PageLoading = (await import("@/components/ui/PageLoading")).default;
    const { container } = render(<PageLoading />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(container.innerHTML).not.toContain("animate-spin");
    expect(container.innerHTML).toMatch(/h-\d+/);
  });
  it("cada árvore privada sem carregando próprio o reexporta; a raiz e as páginas públicas indexáveis continuam sem (D-043)", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    for (const d of ["admin", "conta", "cotacao", "enviar-lista", "carrinho", "cadastrar-papelaria"]) {
      const f = `app/${d}/loading.tsx`;
      expect(existsSync(f), f).toBe(true);
      expect(readFileSync(f, "utf8")).toContain("@/components/ui/PageLoading");
    }
    expect(existsSync("app/loading.tsx")).toBe(false);
  });
});
