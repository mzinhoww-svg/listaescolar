// S29 T12 · J2 (família compra): carrinho, checkout, ponte para a loja e vazios.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCartView = vi.fn();
vi.mock("@/features/cart/page-data", async (orig) => ({ ...(await orig<typeof import("@/features/cart/page-data")>()), requireCartView: (...a: unknown[]) => requireCartView(...a) }));
vi.mock("@/features/lists/queries", () => ({ getListOriginByVersion: vi.fn(), listOriginHref: () => "/" }));
vi.mock("@/components/analytics/TrackView", () => ({ TrackView: () => null }));
vi.mock("@/app/carrinho/[id]/actions", () => ({ chooseOptionAction: vi.fn() }));

import { CartIntro } from "@/components/cart/CartIntro";
import { EmptyState } from "@/components/cart/CartStates";
import { OptionCard } from "@/components/cart/OptionCard";
import { StoreCard } from "@/components/cart/StoreCard";
import { cartOptionHref } from "@/components/cart/format";
import CarrinhoPage from "@/app/carrinho/[id]/page";
import type { CartStrategy } from "@/features/cart/types";
import { novaHref } from "@/features/leads/filters";

import { CART, missing, option, priced, stores } from "./fixtures";

const noop = async (): Promise<void> => {};
const partialLocal = option({
  strategy: "local_stationery",
  status: "partial",
  totalCents: 3480,
  lines: [priced({ storeId: "local:p" }), priced({ itemKey: "b", storeId: "local:p" }), missing, { ...missing, itemKey: "d" }],
  stores: ["local:p"],
  missingItems: ["cola", "d"],
});

describe("UX-033 · uma opção domina; o resto é secundário", () => {
  it("só a opção dominante tem 'Escolher esta' em Tinta cheio; as outras usam contorno", () => {
    render(
      <ul>
        <OptionCard option={option()} cartId={CART} selected dominant action={noop} />
        <OptionCard option={option({ strategy: "balanced" })} cartId={CART} selected={false} action={noop} />
      </ul>,
    );
    const [first, second] = screen.getAllByRole("button", { name: "Escolher esta" });
    expect(first!.className).toContain("bg-tinta");
    expect(second!.className).not.toContain("bg-tinta");
    expect(second!.className).toContain("border-tinta");
  });

  it("'prazo e estoque indisponíveis' aparece uma vez no topo, não em cada cartão", () => {
    const opts = (["cheapest", "balanced", "fewest_stores"] as CartStrategy[]).map((s) => option({ strategy: s }));
    const { container } = render(
      <>
        <CartIntro options={opts} />
        <ul>
          {opts.map((o) => (
            <OptionCard key={o.strategy} option={o} cartId={CART} selected={false} action={noop} />
          ))}
        </ul>
      </>,
    );
    expect(container.textContent!.match(/Prazo e estoque: indisponíveis/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("prazo indisponível");
    expect(container.textContent).not.toContain("estoque indisponível");
  });
});

describe("UX-034 · cotação local parcial", () => {
  it("diz 'parcial: 2 de 4 itens com preço' em corpo normal e não leva selo de menor preço", () => {
    render(
      <ul>
        <OptionCard option={{ ...partialLocal, strategy: "cheapest" }} cartId={CART} selected={false} action={noop} />
      </ul>,
    );
    const card = screen.getByTestId("option-cheapest");
    const note = within(card).getByText("parcial: 2 de 4 itens com preço");
    expect(note.className).toContain("text-sm");
    expect(note.className).not.toContain("text-xs");
    expect(within(card).queryByText("Menor preço")).toBeNull();
    expect(within(card).queryByText(/Total parcial/)).toBeNull();
  });
});

describe("UX-030 · voltar mantém a opção (URL/servidor, não estado React)", () => {
  it("cartOptionHref grava a opção na URL do carrinho", () => {
    expect(cartOptionHref(CART, "fewest_stores")).toBe(`/carrinho/${CART}?opcao=fewest_stores`);
    expect(cartOptionHref(CART, null)).toBe(`/carrinho/${CART}`);
  });

  it("o pedido de cotação leva a opção da tela e a volta a reaproveita", () => {
    render(
      <ul>
        <OptionCard option={option({ strategy: "local_stationery" })} cartId={CART} selected={false} pageStrategy="fewest_stores" action={noop} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Pedir cotação a papelarias" })).toHaveAttribute("href", `/cotacao/nova?carrinho=${CART}&opcao=fewest_stores`);
    expect(novaHref({ carrinho: CART, opcao: "fewest_stores", bairro: "Centro" })).toBe(`/cotacao/nova?carrinho=${CART}&opcao=fewest_stores&bairro=Centro`);
  });

  describe("página do carrinho", () => {
    const view = (strategy: CartStrategy | null) => ({
      cart: { id: CART, listId: null, isDemo: false, strategy, items: [] },
      options: (["cheapest", "balanced", "fewest_stores", "local_stationery"] as CartStrategy[]).map((s) => option({ strategy: s })),
      stores,
      openedSlugs: [],
    });
    const render$ = async (sp: Record<string, string>) => render(await CarrinhoPage({ params: Promise.resolve({ id: CART }), searchParams: Promise.resolve(sp) } as never));
    beforeEach(() => requireCartView.mockReset());

    it("com ?opcao= na URL, essa opção volta marcada", async () => {
      requireCartView.mockResolvedValue(view("cheapest"));
      await render$({ opcao: "fewest_stores" });
      expect(screen.getByTestId("option-fewest_stores")).toHaveAttribute("aria-current", "true");
      expect(screen.getByTestId("option-cheapest")).not.toHaveAttribute("aria-current");
    });

    it("sem ?opcao=, volta a que o servidor gravou ao escolher", async () => {
      requireCartView.mockResolvedValue(view("fewest_stores"));
      await render$({});
      expect(screen.getByTestId("option-fewest_stores")).toHaveAttribute("aria-current", "true");
    });
  });
});

describe("UX-036 e UX-038 · checkout", () => {
  const info = stores.amazon!;
  const two = [priced(), priced({ itemKey: "lapis", name: "Lápis" })];
  const renderStore = () => render(<ul><StoreCard cartId={CART} info={info} lines={two} itemIdFor={(l) => l.itemKey} opened={false} primary /></ul>);

  it("'Buscar' tem alvo de 44 px e não repete o destino do botão da loja", () => {
    renderStore();
    const buscar = screen.getAllByRole("link", { name: /^Buscar/ });
    expect(buscar).toHaveLength(1);
    expect(buscar[0]!.className).toContain("min-h-11");
    expect(buscar[0]).toHaveAttribute("href", `/ir-para/${CART}/amazon?item=lapis`);
    expect(screen.getByRole("link", { name: "Abrir busca de Caderno em Amazon" })).toHaveAttribute("href", `/ir-para/${CART}/amazon?item=caderno`);
  });

  it("'Já comprei em' tem aparência de botão ativo e alvo de 44 px", () => {
    renderStore();
    const b = screen.getByRole("button", { name: /Já comprei em Amazon/ });
    expect(b.className).toContain("h-11");
    expect(b.className).toContain("border");
  });
});

describe("UX-037 · vazios levam a algum lugar", () => {
  it("EmptyState com ações: Buscar escola e Meus carrinhos", () => {
    render(<EmptyState title="Nenhum carrinho escolhido" text="x" actions={[{ href: "/escolas", label: "Buscar escola" }, { href: "/conta/carrinhos", label: "Meus carrinhos" }]} />);
    expect(screen.getByRole("link", { name: "Buscar escola" })).toHaveAttribute("href", "/escolas");
    expect(screen.getByRole("link", { name: "Meus carrinhos" })).toHaveAttribute("href", "/conta/carrinhos");
    expect(screen.queryByRole("link", { name: "Ir para o início" })).toBeNull();
  });

  it("sem ações, mantém 'Ir para o início'", () => {
    render(<EmptyState title="t" text="x" />);
    expect(screen.getByRole("link", { name: "Ir para o início" })).toBeInTheDocument();
  });
});
