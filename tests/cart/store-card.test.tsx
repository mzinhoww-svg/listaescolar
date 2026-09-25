import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OptionDetail } from "@/components/cart/OptionDetail";
import { StoreCard } from "@/components/cart/StoreCard";

import { CART, option, priced, stores } from "./fixtures";

describe("LineRow fail-closed", () => {
  it("com preço mas sem origem ou sem data: 'preço indisponível' e sem R$", () => {
    for (const bad of [priced({ source: null }), priced({ checkedAt: null })]) {
      const { container, unmount } = render(
        <OptionDetail option={option({ lines: [bad] })} stores={stores} />,
      );
      const row = container.querySelector("li") as HTMLElement;
      expect(row.textContent).toContain("preço indisponível");
      expect(row.textContent).not.toMatch(/R\$/);
      unmount();
    }
  });
});

describe("StoreCard", () => {
  const info = stores.amazon!;
  it("botão aponta para a rota /ir-para (âncora simples) e nunca para a loja", () => {
    render(
      <ul>
        <StoreCard
          cartId={CART}
          info={info}
          lines={[priced()]}
          itemIdFor={() => "abc"}
          opened={false}
          primary
        />
      </ul>,
    );
    const a = screen.getByRole("link", { name: "Abrir busca de Caderno em Amazon" });
    expect(a).toHaveAttribute("href", `/ir-para/${CART}/amazon?item=abc`);
    expect(screen.getByText("Falta abrir")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("produto-secreto");
  });

  it("cada linha tem seu link de busca com o próprio item", () => {
    render(
      <ul>
        <StoreCard
          cartId={CART}
          info={info}
          lines={[priced(), priced({ itemKey: "lapis", name: "Lápis" })]}
          itemIdFor={(l) => (l.itemKey === "lapis" ? "id-lapis" : "id-caderno")}
          opened={false}
          primary
        />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Buscar Lápis em Amazon" })).toHaveAttribute(
      "href",
      `/ir-para/${CART}/amazon?item=id-lapis`,
    );
    expect(screen.getByRole("link", { name: "Buscar Caderno em Amazon" })).toHaveAttribute(
      "href",
      `/ir-para/${CART}/amazon?item=id-caderno`,
    );
  });

  it("aberto e selo de afiliado", () => {
    render(
      <ul>
        <StoreCard
          cartId={CART}
          info={{ ...info, affiliateApplied: true }}
          lines={[priced()]}
          itemIdFor={() => undefined}
          opened
          primary={false}
        />
      </ul>,
    );
    expect(screen.getByText("Aberto")).toBeInTheDocument();
    expect(screen.getByText("link afiliado")).toBeInTheDocument();
  });
});
