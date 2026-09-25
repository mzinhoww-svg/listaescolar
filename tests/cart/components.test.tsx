import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OptionCard } from "@/components/cart/OptionCard";
import { OptionDetail } from "@/components/cart/OptionDetail";
import { StoreCard } from "@/components/cart/StoreCard";
import { deliveryText, formatCheckedAt } from "@/components/cart/format";
import type { StoreInfo } from "@/features/cart/service";
import type { CartOption, OptionLine } from "@/features/cart/types";

// Fixtures de teste: valores fictícios.
const CHECKED = new Date("2026-09-24T12:30:00.000Z");
const CART = "11111111-1111-4111-8111-111111111111";

const priced = (over: Partial<OptionLine> = {}): OptionLine => ({
  itemKey: "caderno",
  name: "Caderno",
  quantity: 2,
  status: "priced",
  storeId: "amazon",
  unitPriceCents: 1500,
  lineTotalCents: 3000,
  source: "manual_admin",
  checkedAt: CHECKED,
  url: "https://www.amazon.com.br/produto-secreto",
  ...over,
});
const missing: OptionLine = {
  itemKey: "cola",
  name: "Cola",
  quantity: 1,
  status: "unavailable",
  storeId: null,
  unitPriceCents: null,
  lineTotalCents: null,
  source: null,
  checkedAt: null,
};
const option = (over: Partial<CartOption> = {}): CartOption => ({
  strategy: "cheapest",
  status: "available",
  totalCents: 3000,
  lines: [priced()],
  stores: ["amazon"],
  missingItems: [],
  staleExcluded: [],
  ...over,
});
const stores: Record<string, StoreInfo> = {
  amazon: { id: "amazon", name: "Amazon", initials: "A", affiliateApplied: false },
};

describe("OptionCard", () => {
  it("mostra total, lojas e 'prazo indisponível' sem dado de prazo", () => {
    render(
      <ul>
        <OptionCard option={option()} cartId={CART} selected />
      </ul>,
    );
    expect(screen.getByText("R$ 30,00")).toBeInTheDocument();
    expect(screen.getByText("1 loja")).toBeInTheDocument();
    expect(screen.getByText("prazo indisponível")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escolher esta" })).toHaveAttribute(
      "href",
      `/carrinho/${CART}/checkout?opcao=cheapest`,
    );
    expect(screen.queryByText("Demonstração")).not.toBeInTheDocument();
  });

  it("selo Demonstração no total quando alguma linha é demo", () => {
    render(
      <ul>
        <OptionCard
          option={option({ lines: [priced({ isDemo: true, source: "demo" })] })}
          cartId={CART}
          selected={false}
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
        <OptionCard option={o} cartId={CART} selected={false} />
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
        <OptionCard option={o} cartId={CART} selected={false} />
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
    const a = screen.getByRole("link", { name: "Abrir em Amazon" });
    expect(a).toHaveAttribute("href", `/ir-para/${CART}/amazon?item=abc`);
    expect(screen.getByText("Falta abrir")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("produto-secreto");
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
