// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "@/app/loading";
import { outlineButton, primaryButton } from "@/components/auth/Screen";

/**
 * S18 (estados e a11y): `app/loading.tsx` cobre por herança as ~75 rotas que não tinham `loading.tsx` próprio; a
 * animação respeita `prefers-reduced-motion` (D-057/estados). `primaryButton`/`outlineButton` (usados por ~20
 * telas de sistema) ganharam foco visível — antes desta fatia dependiam só do padrão do navegador.
 */
describe("app/loading.tsx", () => {
  it("anuncia o carregamento para leitor de tela e desliga a animação com prefers-reduced-motion", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(status.querySelector(".motion-reduce\\:animate-none")).not.toBeNull();
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
