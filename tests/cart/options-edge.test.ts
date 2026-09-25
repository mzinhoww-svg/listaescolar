import { describe, expect, it } from "vitest";

import { buildCartOptions } from "@/features/cart/options-engine";
import type { CartOption } from "@/features/cart/types";

import { CADERNO, COLA, hoursAgo, item, LAPIS, lq, NOW, q } from "./helpers";

const by = (opts: CartOption[], s: CartOption["strategy"]): CartOption => {
  const found = opts.find((o) => o.strategy === s);
  if (!found) throw new Error(`sem opção ${s}`);
  return found;
};

describe("staleExcluded: pares estruturados", () => {
  it("varejista com preço velho e fresco do mesmo item: nada excluído", () => {
    const opts = buildCartOptions(
      [COLA],
      [q("a", COLA, 100, { checkedAt: hoursAgo(30) }), q("a", COLA, 120)],
      null,
      NOW,
    );
    expect(by(opts, "cheapest")).toMatchObject({ totalCents: 120, staleExcluded: [] });
  });

  it("papelaria local (id com ':') com velho e fresco do mesmo item: nada excluído", () => {
    const local = [lq("p1", COLA, 100, { checkedAt: hoursAgo(30) }), lq("p1", COLA, 130)];
    const o = by(buildCartOptions([COLA], [], local, NOW), "local_stationery");
    expect(o).toMatchObject({ status: "available", totalCents: 130, staleExcluded: [] });
  });

  it("papelaria local só com preço velho: lista o par completo", () => {
    const o = by(
      buildCartOptions([COLA], [], [lq("p1", COLA, 100, { checkedAt: hoursAgo(30) })], NOW),
      "local_stationery",
    );
    expect(o.staleExcluded).toEqual(["local:p1:cola branca"]);
  });

  it("item com ':' no nome e loja só com velho: par completo, sem confundir loja e item", () => {
    const odd = item("Kit: caneta", 1);
    const o = by(
      buildCartOptions([odd], [q("a", odd, 100, { checkedAt: hoursAgo(30) })], null, NOW),
      "cheapest",
    );
    expect(o.staleExcluded).toEqual(["a:kit: caneta"]);
  });
});

describe("entradas de borda", () => {
  it("item válido e inválido com a mesma chave: não vira ausente", () => {
    const opts = buildCartOptions([COLA, { ...COLA, quantity: 0 }], [q("a", COLA, 100)], null, NOW);
    expect(by(opts, "cheapest")).toMatchObject({
      status: "available",
      totalCents: 100,
      missingItems: [],
    });
  });

  it("overflow de linha: unavailable com reason amount_overflow em todas as estratégias de loja", () => {
    const huge = item("Resma gigante", Number.MAX_SAFE_INTEGER);
    const opts = buildCartOptions([huge, COLA], [q("a", huge, 2), q("a", COLA, 5)], null, NOW);
    for (const s of ["cheapest", "fewest_stores", "balanced"] as const) {
      expect(by(opts, s)).toMatchObject({
        status: "unavailable",
        totalCents: null,
        reason: "amount_overflow",
      });
    }
  });

  it("overflow na papelaria local também reporta amount_overflow", () => {
    const huge = item("Resma gigante", Number.MAX_SAFE_INTEGER);
    const o = by(buildCartOptions([huge], [], [lq("p1", huge, 2)], NOW), "local_stationery");
    expect(o).toMatchObject({ status: "unavailable", reason: "amount_overflow" });
  });

  it("quantidades somadas fora do inteiro seguro: item vai para os inválidos, não some", () => {
    const opts = buildCartOptions(
      [
        { ...COLA, quantity: Number.MAX_SAFE_INTEGER },
        { ...COLA, quantity: Number.MAX_SAFE_INTEGER },
        LAPIS,
      ],
      [q("a", COLA, 1), q("a", LAPIS, 10)],
      null,
      NOW,
    );
    expect(by(opts, "cheapest")).toMatchObject({
      status: "partial",
      totalCents: 30,
      missingItems: ["cola branca"],
    });
  });
});

describe("desempate de oferta por isDemo e url", () => {
  it("mesmo preço, data e origem: prefere a oferta real à demo, em qualquer ordem", () => {
    const real = q("a", COLA, 100, { url: "https://a.example/z", isDemo: false });
    const demo = q("a", COLA, 100, { url: "https://a.example/a", isDemo: true });
    for (const quotes of [
      [real, demo],
      [demo, real],
    ]) {
      const l = by(buildCartOptions([COLA], quotes, null, NOW), "cheapest").lines[0];
      expect(l?.isDemo).toBe(false);
      expect(l?.url).toBe("https://a.example/z");
    }
  });

  it("empate total: menor url, independente da ordem", () => {
    const x = q("a", COLA, 100, { url: "https://a.example/2" });
    const y = q("a", COLA, 100, { url: "https://a.example/1" });
    for (const quotes of [
      [x, y],
      [y, x],
    ]) {
      expect(by(buildCartOptions([COLA], quotes, null, NOW), "cheapest").lines[0]?.url).toBe(
        "https://a.example/1",
      );
    }
  });
});

describe("balanced: cobertura = disponibilidade confirmada", () => {
  it("estoque confirmado (inStock true) pesa mais que uma pequena diferença de preço", () => {
    const one = item("Mochila", 1);
    const quotes = [q("x", one, 1000), q("y", one, 1050, { inStock: true })];
    expect(by(buildCartOptions([one], quotes, null, NOW), "balanced").stores).toEqual(["y"]);
  });

  it("estoque desconhecido conta 0: sem confirmação em ninguém, vence o mais barato", () => {
    const one = item("Mochila", 1);
    const quotes = [q("x", one, 1000), q("y", one, 1050)];
    expect(by(buildCartOptions([one], quotes, null, NOW), "balanced").stores).toEqual(["x"]);
  });
});

describe("fewest_stores: desempate por total", () => {
  it("mesmo nº de lojas: escolhe a de menor total, mesmo com id alfabético maior", () => {
    const quotes = [q("alfa", CADERNO, 900), q("zeta", CADERNO, 500)];
    expect(by(buildCartOptions([CADERNO], quotes, null, NOW), "fewest_stores")).toMatchObject({
      stores: ["zeta"],
      totalCents: 1000,
    });
  });
});
