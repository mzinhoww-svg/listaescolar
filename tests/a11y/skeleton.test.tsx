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

describe("UX-004 · app/loading.tsx", () => {
  it("é um esqueleto com role=status, aria-busy, altura reservada e sem spinner de tela cheia", async () => {
    const Loading = (await import("@/app/loading")).default;
    const { container } = render(<Loading />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(container.innerHTML).not.toContain("animate-spin");
    expect(container.innerHTML).toMatch(/h-\d+/);
  });
});
