import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartIntro } from "@/components/cart/CartIntro";
import { OptionCard } from "@/components/cart/OptionCard";
import { orderOptions } from "@/components/cart/format";
import type { CartOption, CartStrategy } from "@/features/cart/types";

import { CART, missing, option } from "./fixtures";

const noop = async (): Promise<void> => {};
const none = (strategy: CartStrategy): CartOption =>
  option({ strategy, status: "unavailable", totalCents: null, lines: [missing], stores: [] });
const STRATEGIES: CartStrategy[] = ["cheapest", "balanced", "fewest_stores", "local_stationery"];

describe("carrinho sem preço (M05)", () => {
  const four = STRATEGIES.map(none);

  it("o título conta as opções exibidas (4), não só as com preço", () => {
    render(<CartIntro options={four} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Montamos 4 opções para a lista");
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
