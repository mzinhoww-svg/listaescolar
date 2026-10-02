import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartIntro } from "@/components/cart/CartIntro";
import { OptionCard } from "@/components/cart/OptionCard";
import { orderOptions, visibleOptions } from "@/components/cart/format";
import type { CartOption, CartStrategy } from "@/features/cart/types";

import { CART, missing, option } from "./fixtures";

const noop = async (): Promise<void> => {};
const none = (strategy: CartStrategy): CartOption =>
  option({ strategy, status: "unavailable", totalCents: null, lines: [missing], stores: [] });
const STRATEGIES: CartStrategy[] = ["cheapest", "balanced", "fewest_stores", "local_stationery"];

describe("carrinho sem preço (M05)", () => {
  const four = STRATEGIES.map(none);

  it("sem preço nenhum, o título orienta para a cotação (não conta opções vazias)", () => {
    render(<CartIntro options={four} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Peça a cotação a uma papelaria");
  });

  it("sem preço de fonte, diz que a papelaria informa o preço e não mostra valor em reais", () => {
    const { container } = render(<CartIntro options={four} />);
    expect(container.textContent).toContain("Ainda não temos preço de loja para esta lista. A papelaria informa o preço na cotação");
    expect(container.textContent).not.toMatch(/R\$/);
  });

  it("papelaria local vem primeiro quando nenhuma opção tem preço", () => {
    expect(orderOptions(four).map((o) => o.strategy)).toEqual(["local_stationery", "cheapest", "balanced", "fewest_stores"]);
    const { container } = render(
      <ul>
        {orderOptions(four).map((o) => (
          <OptionCard key={o.strategy} option={o} cartId={CART} selected={false} action={noop} />
        ))}
      </ul>,
    );
    expect(container.querySelector("li")).toHaveAttribute("data-testid", "option-local_stationery");
    expect(screen.getByRole("link", { name: "Pedir cotação a papelarias" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/R\$/);
  });

  it("com alguma opção com preço a ordem original se mantém e o aviso some", () => {
    const mixed = [option(), none("balanced"), none("fewest_stores"), none("local_stationery")];
    expect(orderOptions(mixed).map((o) => o.strategy)).toEqual(["cheapest", "balanced", "fewest_stores", "local_stationery"]);
    const { container } = render(<CartIntro options={mixed} />);
    expect(container.textContent).not.toContain("Ainda não temos preço de loja");
  });
});

describe("carrinho com preço em parte das opções (revisão UX I3)", () => {
  const priced = option();
  const four = STRATEGIES.map(none);
  const mixed = [priced, none("fewest_stores"), none("balanced"), none("local_stationery")];

  it("o título conta só as opções com preço", () => {
    render(<CartIntro options={mixed} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Montamos 1 opção para a lista");
  });

  it("junta as opções sem preço num único aviso", () => {
    const { container } = render(<CartIntro options={mixed} />);
    expect(container.textContent).toContain("Sem preço de loja para: Menos lojas, Recomendado.");
    expect(container.textContent).not.toContain("Papelaria local.");
  });

  it("só as opções com preço e a papelaria local ganham cartão", () => {
    expect(visibleOptions(mixed).map((o) => o.strategy)).toEqual([priced.strategy, "local_stationery"]);
    expect(visibleOptions(four)).toHaveLength(1);
  });

  it("na papelaria local sem preço, o pedido de cotação vem antes do preço, como botão principal", () => {
    const { container } = render(<OptionCard option={none("local_stationery")} cartId={CART} selected={false} action={noop} />);
    const html = container.innerHTML;
    expect(html.indexOf("Pedir cotação a papelarias")).toBeGreaterThan(-1);
    expect(html.indexOf("Pedir cotação a papelarias")).toBeLessThan(html.indexOf("indisponível"));
  });

  it("total parcial usa a concordância de item", () => {
    const one = option({ status: "partial", missingItems: ["Caderno"] });
    const { container, rerender } = render(<OptionCard option={one} cartId={CART} selected={false} action={noop} />);
    expect(container.textContent).toContain("1 item sem preço disponível");
    rerender(<OptionCard option={option({ status: "partial", missingItems: ["A", "B"] })} cartId={CART} selected={false} action={noop} />);
    expect(container.textContent).toContain("2 itens sem preço disponível");
  });
});
