// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { outlineButton, primaryButton } from "@/components/auth/Screen";

/**
 * S28 (Task 17): `app/loading.tsx` na raiz foi removido. Um `loading.tsx` na raiz envolve TODA rota em Suspense e força
 * streaming, e com streaming `notFound()`/`redirect()` respondem HTTP 200 (soft-404, D-043). Esqueletos ficam só nas
 * árvores privadas (`papelaria`, `escola`, `carrinho`), que não dependem de indexação.
 */
describe("sem loading.tsx na raiz (soft-404, D-043)", () => {
  it("app/loading.tsx não existe", () => {
    expect(existsSync(join(process.cwd(), "app", "loading.tsx"))).toBe(false);
  });
  it("as páginas públicas indexáveis não têm loading.tsx", () => {
    expect(existsSync(join(process.cwd(), "app", "escolas", "[inep]", "[serie]", "loading.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app", "escolas", "[inep]", "loading.tsx"))).toBe(false);
  });
});

describe("primaryButton / outlineButton (components/auth/Screen)", () => {
  it("as duas variantes têm foco visível explícito", () => {
    expect(primaryButton).toMatch(/focus-visible:outline-2/);
    expect(primaryButton).toMatch(/focus-visible:outline-offset-2/);
    expect(outlineButton).toMatch(/focus-visible:outline-2/);
    expect(outlineButton).toMatch(/focus-visible:outline-offset-2/);
  });
});
