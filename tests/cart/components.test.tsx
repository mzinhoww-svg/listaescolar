import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OptionCard } from "@/components/cart/OptionCard";
import { OptionDetail } from "@/components/cart/OptionDetail";
import { deliveryText, formatCheckedAt, stockText } from "@/components/cart/format";

import { CART, CHECKED, missing, option, priced, stores } from "./fixtures";

const noop = async (): Promise<void> => {};

describe("OptionCard", () => {
  it("'Escolher esta' é um botão de formulário (persiste a escolha) com strategy e cartId", () => {
    const { container } = render(
      <ul>
        <OptionCard option={option()} cartId={CART} selected action={noop} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Escolher esta" })).toBeInTheDocument();
    expect(container.querySelector('input[name="strategy"]')).toHaveValue("cheapest");
    expect(container.querySelector('input[name="cartId"]')).toHaveValue(CART);
  });

  it("opção indisponível nunca aparece como selecionada, mesmo se pedida", () => {
    const o = option({ status: "unavailable", totalCents: null, lines: [missing], stores: [] });
    render(
      <ul>
        <OptionCard option={o} cartId={CART} selected action={noop} />
      </ul>,
    );
    expect(screen.getByTestId("option-cheapest")).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("button", { name: "Escolher esta" })).not.toBeInTheDocument();
  });

  it("selecionada marca aria-current; título da opção é h2 (sem pular nível)", () => {
    render(
      <ul>
        <OptionCard option={option()} cartId={CART} selected action={noop} />
      </ul>,
    );
    expect(screen.getByTestId("option-cheapest")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Mais barato" })).toBeInTheDocument();
  });

  it("estoque: 'indisponível' quando a fonte não trouxe; só afirma com todas as linhas confirmadas", () => {
    expect(stockText(option())).toBe("estoque indisponível");
    expect(stockText(option({ lines: [priced({ inStock: true })] }))).toBe("em estoque");
    expect(
      stockText(option({ lines: [priced({ inStock: true }), priced({ itemKey: "b" })] })),
    ).toBe("estoque indisponível");
    expect(stockText(option({ lines: [priced({ inStock: false })] }))).toBe(
      "sem estoque em algum item",
    );
  });

  it("mostra total, lojas e 'prazo indisponível' sem dado de prazo", () => {
    render(
      <ul>
        <OptionCard option={option()} cartId={CART} selected action={noop} />
      </ul>,
    );
    expect(screen.getByText("R$ 30,00")).toBeInTheDocument();
    expect(screen.getByText("1 loja")).toBeInTheDocument();
    expect(screen.getByText("prazo indisponível")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher esta" })).toBeInTheDocument();
    expect(screen.queryByText("Demonstração")).not.toBeInTheDocument();
  });

  it("selo Demonstração no total quando alguma linha é demo", () => {
    render(
      <ul>
        <OptionCard
          option={option({ lines: [priced({ isDemo: true, source: "demo" })] })}
          cartId={CART}
          selected={false}
          action={noop}
        />
      </ul>,
    );
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
  });

  it("opção indisponível: sem número, sem 'Escolher esta'", () => {
    const o = option({
      status: "unavailable",
      totalCents: null,
      lines: [missing],
      stores: [],
      reason: "no_price_source",
    });
    const { container } = render(
      <ul>
        <OptionCard option={o} cartId={CART} selected={false} action={noop} />
      </ul>,
    );
    expect(screen.getByText("indisponível")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Escolher esta" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/R\$/);
  });

  it("papelaria local sem cotação diz isso", () => {
    const o = option({
      strategy: "local_stationery",
      status: "unavailable",
      totalCents: null,
      lines: [],
      stores: [],
      reason: "no_local_quote",
    });
    render(
      <ul>
        <OptionCard option={o} cartId={CART} selected={false} action={noop} />
      </ul>,
    );
    expect(screen.getByText("Sem cotação da papelaria local.")).toBeInTheDocument();
  });

  it("prazo só quando a fonte traz em todas as linhas", () => {
    expect(
      deliveryText(
        option({ lines: [priced({ deliveryDays: 3 }), priced({ itemKey: "b", deliveryDays: 5 })] }),
      ),
    ).toBe("chega em até 5 dias");
    expect(
      deliveryText(option({ lines: [priced({ deliveryDays: 3 }), priced({ itemKey: "b" })] })),
    ).toBe("prazo indisponível");
  });
});

describe("OptionDetail", () => {
  it("cada preço mostra origem e data/hora; nunca renderiza a URL do produto como link", () => {
    const { container } = render(<OptionDetail option={option()} stores={stores} />);
    expect(screen.getByText(/origem: manual_admin/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(formatCheckedAt(CHECKED).replace(/[/.]/g, "\\$&"))),
    ).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain("produto-secreto");
    expect(screen.getByText(/Preço e estoque podem mudar/)).toBeInTheDocument();
  });

  it("item sem preço: 'preço indisponível' sem placeholder numérico", () => {
    const o = option({ status: "partial", lines: [priced(), missing], missingItems: ["cola"] });
    render(<OptionDetail option={o} stores={stores} />);
    const box = screen.getByText("Sem preço disponível").closest("div") as HTMLElement;
    expect(within(box).getByText("preço indisponível")).toBeInTheDocument();
    expect(box.textContent).not.toMatch(/R\$|0,00/);
  });

  it("selo Demonstração no total com linha demo; selo afiliado só com affiliateApplied", () => {
    const demo = option({ lines: [priced({ isDemo: true, source: "demo" })] });
    const { rerender } = render(<OptionDetail option={demo} stores={stores} />);
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    expect(screen.queryByText("link afiliado")).not.toBeInTheDocument();
    rerender(
      <OptionDetail
        option={demo}
        stores={{ amazon: { ...stores.amazon!, affiliateApplied: true } }}
      />,
    );
    expect(screen.getByText("link afiliado")).toBeInTheDocument();
  });

  it("sem frete da fonte: 'Frete: indisponível'", () => {
    render(<OptionDetail option={option()} stores={stores} />);
    expect(screen.getByText("Frete: indisponível")).toBeInTheDocument();
  });
});
