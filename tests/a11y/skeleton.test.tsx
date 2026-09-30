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
  it("só o cadastro de papelaria (sem guard nem notFound) reexporta PageLoading; árvores com guard/notFound ficam sem loading.tsx (D-043)", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    expect(readFileSync("app/cadastrar-papelaria/loading.tsx", "utf8")).toContain("@/components/ui/PageLoading");
    // Um loading.tsx acima de uma página com `requireAccess`/`notFound()` a põe em streaming e o status vira 200 (soft-404).
    for (const d of ["admin", "conta", "cotacao", "enviar-lista", "carrinho"]) expect(existsSync(`app/${d}/loading.tsx`), d).toBe(false);
    expect(existsSync("app/loading.tsx")).toBe(false);
    // S29 T12: `/carrinho/[id]` chama `notFound()`; o `loading.tsx` que ficou lá dava 200 para id inexistente (D-043).
    for (const f of ["app/carrinho/[id]/loading.tsx", "app/carrinho/novo/loading.tsx", "app/cotacao/[code]/loading.tsx", "app/cotacao/nova/loading.tsx"]) {
      expect(existsSync(f), f).toBe(false);
    }
  });

  // S29 T13 (D-043): um `loading.tsx` sob `app/conta/**` só é aceito se nenhuma página da árvore abaixo dele chama `notFound()`.
  it("conta: loading.tsx só onde a página não tem notFound() (soft-404 provado por scripts/e2e-soft-404.sh)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
    const files = walk("app/conta");
    for (const loading of files.filter((f) => f.endsWith("/loading.tsx"))) {
      const dir = loading.replace(/\/loading\.tsx$/, "");
      for (const f of files.filter((x) => x.startsWith(`${dir}/`) && /\/(page|layout)\.tsx$/.test(x))) {
        expect(readFileSync(f, "utf8"), `${loading} cobre ${f}`).not.toContain("notFound(");
      }
    }
    // Páginas com notFound() (aluno) ficam sem loading acima delas.
    expect(files.some((f) => f === "app/conta/loading.tsx" || f.startsWith("app/conta/alunos/") && f.endsWith("loading.tsx"))).toBe(false);
  });
  it("conta/notificacoes/loading.tsx usa o Skeleton do sistema, com o h1 da página", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/conta/notificacoes/loading.tsx", "utf8");
    expect(src).toContain("@/components/ui/Skeleton");
    expect(src).toContain("Notificações");
  });
});
