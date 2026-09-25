import { describe, expect, it } from "vitest";

import { buildCartOptions, DEFAULT_STALE_AFTER_MS } from "@/features/cart/options-engine";
import { CART_STRATEGIES, type CartOption } from "@/features/cart/types";

import { CADERNO, COLA, datasetA, hoursAgo, item, LAPIS, lq, NOW, q } from "./helpers";

const by = (opts: CartOption[], s: CartOption["strategy"]): CartOption => {
  const found = opts.find((o) => o.strategy === s);
  if (!found) throw new Error(`sem opção ${s}`);
  return found;
};
const ITEMS = [CADERNO, LAPIS, COLA];

describe("buildCartOptions: as quatro estratégias (fixtures de teste)", () => {
  const cases = [
    {
      name: "A: kalunga caderno 1000",
      caderno: 1000,
      cheapest: [2500, ["amazon", "magalu"]],
      fewest: [2900, ["kalunga"]],
      balanced: [2900, ["kalunga"]],
    },
    {
      name: "B: kalunga caderno 2000",
      caderno: 2000,
      cheapest: [2500, ["amazon", "magalu"]],
      fewest: [4900, ["kalunga"]],
      balanced: [2500, ["amazon", "magalu"]],
    },
  ] as const;

  for (const c of cases) {
    it(c.name, () => {
      const opts = buildCartOptions(ITEMS, datasetA(c.caderno), null, NOW);
      expect(opts.map((o) => o.strategy)).toEqual([...CART_STRATEGIES]);
      for (const [strategy, [total, stores]] of [
        ["cheapest", c.cheapest],
        ["fewest_stores", c.fewest],
        ["balanced", c.balanced],
      ] as const) {
        const o = by(opts, strategy);
        expect(o.status).toBe("available");
        expect(o.totalCents).toBe(total);
        expect(o.stores).toEqual(stores);
        expect(o.missingItems).toEqual([]);
      }
      expect(by(opts, "local_stationery")).toMatchObject({
        status: "unavailable",
        reason: "no_local_quote",
        totalCents: null,
      });
    });
  }

  it("aritmética em centavos inteiros: preço x quantidade por linha", () => {
    const o = by(buildCartOptions(ITEMS, datasetA(1000), null, NOW), "cheapest");
    expect(o.lines.map((l) => [l.itemKey, l.storeId, l.unitPriceCents, l.lineTotalCents])).toEqual([
      ["caderno 96 folhas", "magalu", 900, 1800],
      ["lapis hb", "amazon", 150, 450],
      ["cola branca", "amazon", 250, 250],
    ]);
  });

  it("balanced: prazo vindo da fonte pode virar a escolha; sem prazo, ele não entra", () => {
    const one = [item("Mochila", 1)];
    const withDelivery = [
      q("x", one[0]!, 1000, { deliveryDays: 10 }),
      q("y", one[0]!, 1050, { deliveryDays: 1 }),
    ];
    expect(by(buildCartOptions(one, withDelivery, null, NOW), "balanced").stores).toEqual(["y"]);
    const noDelivery = [q("x", one[0]!, 1000), q("y", one[0]!, 1050)];
    expect(by(buildCartOptions(one, noDelivery, null, NOW), "balanced").stores).toEqual(["x"]);
  });

  it("empate perfeito: desempate estável por ordem alfabética, independente da ordem de entrada", () => {
    const quotes = [q("beta", CADERNO, 500), q("alfa", CADERNO, 500)];
    const a = buildCartOptions([CADERNO], quotes, null, NOW);
    const b = buildCartOptions([CADERNO], [...quotes].reverse(), null, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const s of ["cheapest", "fewest_stores", "balanced"] as const)
      expect(by(a, s).stores).toEqual(["alfa"]);
  });

  it("balanced é determinístico", () => {
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(buildCartOptions(ITEMS, datasetA(1300), null, NOW)),
    );
    expect(new Set(runs).size).toBe(1);
  });

  it("loja com parte dos itens: total só soma itens com preço e traz missingItems (partial)", () => {
    const opts = buildCartOptions(
      ITEMS,
      [q("magalu", CADERNO, 900), q("magalu", LAPIS, 250)],
      null,
      NOW,
    );
    for (const s of ["cheapest", "fewest_stores", "balanced"] as const) {
      expect(by(opts, s)).toMatchObject({
        status: "partial",
        totalCents: 2550,
        missingItems: ["cola branca"],
        stores: ["magalu"],
      });
      expect(by(opts, s).lines.find((l) => l.itemKey === "cola branca")).toMatchObject({
        status: "unavailable",
        unitPriceCents: null,
        source: null,
        checkedAt: null,
      });
    }
  });

  it("um só item e loja única", () => {
    const o = by(buildCartOptions([COLA], [q("kalunga", COLA, 333)], null, NOW), "fewest_stores");
    expect(o).toMatchObject({ status: "available", totalCents: 333, stores: ["kalunga"] });
  });

  it("mesmo item em várias lojas: fica o mais barato; empate de preço vai para a loja de id menor", () => {
    const quotes = [
      q("a", COLA, 300, { checkedAt: hoursAgo(5) }),
      q("b", COLA, 300, { checkedAt: hoursAgo(1) }),
      q("c", COLA, 301),
    ];
    const o = by(buildCartOptions([COLA], quotes, null, NOW), "cheapest");
    expect(o.lines[0]?.storeId).toBe("a");
    expect(o.totalCents).toBe(300);
  });

  it("mesma loja e mesmo preço em duas datas: vale a consulta mais recente", () => {
    const quotes = [
      q("a", COLA, 300, { checkedAt: hoursAgo(5) }),
      q("a", COLA, 300, { checkedAt: hoursAgo(1) }),
    ];
    const l = by(buildCartOptions([COLA], quotes, null, NOW), "cheapest").lines[0];
    expect(l?.checkedAt).toEqual(hoursAgo(1));
  });

  it("quantidade alta: sem float; overflow vira indisponível, nunca valor errado", () => {
    const big = item("Resma", 1_000_000);
    expect(by(buildCartOptions([big], [q("a", big, 2599)], null, NOW), "cheapest").totalCents).toBe(
      2_599_000_000,
    );
    const huge = item("Resma gigante", Number.MAX_SAFE_INTEGER);
    const o = by(buildCartOptions([huge], [q("a", huge, 2)], null, NOW), "cheapest");
    expect(o).toMatchObject({ status: "unavailable", totalCents: null });
  });

  it("itens repetidos somam quantidade; quantidade inválida vira item ausente", () => {
    const opts = buildCartOptions(
      [COLA, { ...COLA, quantity: 2 }, { ...LAPIS, quantity: 0 }],
      [q("a", COLA, 100), q("a", LAPIS, 100)],
      null,
      NOW,
    );
    expect(by(opts, "cheapest")).toMatchObject({
      totalCents: 300,
      status: "partial",
      missingItems: ["lapis hb"],
    });
  });
});

describe("buildCartOptions: sem fonte, nada é estimado", () => {
  it("nenhuma cotação: quatro opções unavailable", () => {
    const opts = buildCartOptions(ITEMS, [], null, NOW);
    expect(opts).toHaveLength(4);
    for (const o of opts)
      expect(o).toMatchObject({ status: "unavailable", totalCents: null, stores: [] });
    expect(by(opts, "cheapest").reason).toBe("no_price_source");
    expect(by(opts, "cheapest").missingItems).toEqual(ITEMS.map((i) => i.itemKey));
  });

  it("carrinho vazio", () => {
    for (const o of buildCartOptions([], datasetA(1000), null, NOW))
      expect(o).toMatchObject({ status: "unavailable", reason: "empty_cart" });
  });

  it("item sem correspondência nas cotações fica ausente", () => {
    const opts = buildCartOptions(ITEMS, [q("a", item("Outro produto", 1), 100)], null, NOW);
    expect(by(opts, "cheapest").status).toBe("unavailable");
  });

  it("preço velho (>24 h) fica fora do total e aparece em staleExcluded; 24 h exatas ainda vale", () => {
    const opts = buildCartOptions(
      [COLA],
      [q("velha", COLA, 100, { checkedAt: hoursAgo(25) }), q("nova", COLA, 500)],
      null,
      NOW,
    );
    const o = by(opts, "cheapest");
    expect(o.totalCents).toBe(500);
    expect(o.staleExcluded).toEqual(["velha:cola branca"]);
    const edge = buildCartOptions(
      [COLA],
      [q("lim", COLA, 100, { checkedAt: new Date(NOW.getTime() - DEFAULT_STALE_AFTER_MS) })],
      null,
      NOW,
    );
    expect(by(edge, "cheapest").totalCents).toBe(100);
  });

  it("só preço velho: unavailable com a loja listada como desatualizada", () => {
    const o = by(
      buildCartOptions([COLA], [q("velha", COLA, 100, { checkedAt: hoursAgo(48) })], null, NOW),
      "cheapest",
    );
    expect(o).toMatchObject({
      status: "unavailable",
      totalCents: null,
      staleExcluded: ["velha:cola branca"],
    });
  });

  it("validade configurável", () => {
    const quotes = [q("a", COLA, 100, { checkedAt: hoursAgo(3) })];
    expect(
      by(buildCartOptions([COLA], quotes, null, NOW, { staleAfterMs: 2 * 3_600_000 }), "cheapest")
        .status,
    ).toBe("unavailable");
  });

  it("data no futuro (relógio inconfiável) é excluída; sem estoque não entra", () => {
    const opts = buildCartOptions(
      [COLA],
      [
        q("fut", COLA, 100, { checkedAt: new Date(NOW.getTime() + 3_600_000) }),
        q("sem", COLA, 90, { inStock: false }),
      ],
      null,
      NOW,
    );
    expect(by(opts, "cheapest")).toMatchObject({
      status: "unavailable",
      staleExcluded: ["fut:cola branca"],
    });
  });

  it("cotação sem origem, sem data válida ou com preço inválido é descartada", () => {
    const bad = [
      q("a", COLA, 100, { source: "   " }),
      q("b", COLA, 100, { checkedAt: new Date("lixo") }),
      q("c", COLA, 10.5),
      q("d", COLA, 0),
      q("e", COLA, -5),
      q("f", COLA, Number.NaN),
    ];
    expect(by(buildCartOptions([COLA], bad, null, NOW), "cheapest").status).toBe("unavailable");
  });
});

describe("buildCartOptions: papelaria local", () => {
  it("com cotação da porta: escolhe a papelaria que cobre mais e é mais barata", () => {
    const local = [
      lq("p1", CADERNO, 800),
      lq("p1", LAPIS, 100),
      lq("p2", CADERNO, 700),
      lq("p2", LAPIS, 100),
      lq("p2", COLA, 200),
    ];
    const o = by(buildCartOptions(ITEMS, datasetA(1000), local, NOW), "local_stationery");
    expect(o).toMatchObject({
      status: "available",
      totalCents: 1400 + 300 + 200,
      stores: ["local:p2"],
    });
  });

  it("local vazio ou só velho: unavailable/no_local_quote", () => {
    expect(by(buildCartOptions(ITEMS, [], [], NOW), "local_stationery").reason).toBe(
      "no_local_quote",
    );
    const stale = by(
      buildCartOptions(ITEMS, [], [lq("p1", COLA, 100, { checkedAt: hoursAgo(72) })], NOW),
      "local_stationery",
    );
    expect(stale).toMatchObject({
      status: "unavailable",
      reason: "no_local_quote",
      staleExcluded: ["local:p1:cola branca"],
    });
  });

  it("a papelaria local não contamina as opções de varejistas", () => {
    const local = [lq("p1", COLA, 1)];
    const opts = buildCartOptions([COLA], [q("a", COLA, 500)], local, NOW);
    expect(by(opts, "cheapest").totalCents).toBe(500);
    expect(by(opts, "local_stationery").totalCents).toBe(1);
  });
});
