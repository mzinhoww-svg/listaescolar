import { describe, expect, it } from "vitest";

import { buildCartOptions } from "@/features/cart/options-engine";
import {
  createDemoRetailerProvider,
  DemoRetailerProvider,
  isDemoEnabled,
} from "@/features/cart/demo-provider";
import { formatBRL, mulCents, sumCents } from "@/features/cart/money";
import {
  createDemoListReader,
  DEMO_LIST_ID,
  InMemoryListReader,
} from "@/features/cart/memory-list-reader";
import { normalizeItemKey } from "@/features/cart/item-key";
import {
  cartItemInputSchema,
  createCartSchema,
  redirectParamsSchema,
} from "@/features/cart/schemas";
import { SnapshotRetailerProvider } from "@/features/cart/snapshot-provider";

import { CADERNO, COLA, hoursAgo, NOW } from "./helpers";

const row = (over: Record<string, unknown> = {}) => ({
  retailerSlug: "kalunga",
  itemKey: COLA.itemKey,
  priceCents: 300,
  source: "manual_admin",
  checkedAt: hoursAgo(2).toISOString(),
  productUrl: null,
  isDemo: false,
  ...over,
});

describe("SnapshotRetailerProvider", () => {
  it("mapeia linhas com origem e data; descarta inválidas e demo por padrão", async () => {
    const rows = [
      row(),
      row({ source: "" }),
      row({ checkedAt: null }),
      row({ priceCents: 0 }),
      row({ priceCents: 1.5 }),
      row({ isDemo: true, source: "demo" }),
      "lixo",
    ];
    const provider = new SnapshotRetailerProvider(async () => rows);
    const quotes = await provider.getQuotes([COLA]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      retailerSlug: "kalunga",
      unitPriceCents: 300,
      source: "manual_admin",
    });
    const withDemo = await new SnapshotRetailerProvider(async () => rows, {
      includeDemo: true,
    }).getQuotes([COLA]);
    expect(withDemo.map((x) => x.isDemo)).toEqual([false, true]);
  });

  it("sem itens não consulta a fonte; itens são consultados uma vez por chave", async () => {
    let calls: string[][] = [];
    const provider = new SnapshotRetailerProvider(async (keys) => {
      calls.push(keys);
      return [];
    });
    expect(await provider.getQuotes([])).toEqual([]);
    await provider.getQuotes([COLA, COLA, CADERNO]);
    expect(calls).toEqual([[COLA.itemKey, CADERNO.itemKey]]);
    calls = [];
  });

  it("preço velho passa pelo provedor e o motor o exclui do total", async () => {
    const provider = new SnapshotRetailerProvider(async () => [
      row({ checkedAt: hoursAgo(30).toISOString() }),
    ]);
    const quotes = await provider.getQuotes([COLA]);
    const opt = buildCartOptions([COLA], quotes, null, NOW)[0];
    expect(opt).toMatchObject({ status: "unavailable", staleExcluded: ["kalunga:cola branca"] });
  });
});

describe("DemoRetailerProvider", () => {
  it("só existe com DEMO_RETAILERS=1 e nunca em produção", () => {
    expect(isDemoEnabled({})).toBe(false);
    expect(isDemoEnabled({ DEMO_RETAILERS: "0" })).toBe(false);
    expect(isDemoEnabled({ DEMO_RETAILERS: "true" })).toBe(false);
    expect(isDemoEnabled({ DEMO_RETAILERS: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(isDemoEnabled({ DEMO_RETAILERS: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(createDemoRetailerProvider({})).toBeNull();
    expect(
      createDemoRetailerProvider({ DEMO_RETAILERS: "1", VERCEL_ENV: "production" }),
    ).toBeNull();
    expect(createDemoRetailerProvider({ DEMO_RETAILERS: "1" })).not.toBeNull();
  });

  it("gera cotações marcadas is_demo, com origem e data, determinísticas", async () => {
    const provider = new DemoRetailerProvider(() => NOW);
    const a = await provider.getQuotes([CADERNO, COLA]);
    const b = await provider.getQuotes([CADERNO, COLA]);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const quote of a) {
      expect(quote).toMatchObject({ isDemo: true, source: "demo", checkedAt: NOW });
      expect(Number.isSafeInteger(quote.unitPriceCents)).toBe(true);
    }
    const opts = buildCartOptions([CADERNO, COLA], a, null, NOW);
    expect(opts[3]?.status).toBe("unavailable"); // papelaria local sem cotação
  });
});

describe("ListReader", () => {
  it("InMemoryListReader devolve cópia; lista desconhecida → null", async () => {
    const reader = new InMemoryListReader(
      new Map([["l1", [{ id: "i1", name: "Caderno", quantity: 2 }]]]),
    );
    const items = await reader.getItems("l1");
    expect(items).toEqual([{ id: "i1", name: "Caderno", quantity: 2 }]);
    items?.push({ id: "x", name: "y", quantity: 1 });
    expect(await reader.getItems("l1")).toHaveLength(1);
    expect(await reader.getItems("nope")).toBeNull();
  });

  it("leitor de demonstração só com a flag", async () => {
    expect(createDemoListReader({})).toBeNull();
    expect(createDemoListReader({ DEMO_RETAILERS: "1", VERCEL_ENV: "production" })).toBeNull();
    const items = await createDemoListReader({ DEMO_RETAILERS: "1" })?.getItems(DEMO_LIST_ID);
    expect(items?.length).toBeGreaterThan(0);
  });
});

describe("money, item-key e schemas", () => {
  it("centavos inteiros; overflow e entradas inválidas viram null", () => {
    expect(mulCents(2599, 3)).toBe(7797);
    expect(mulCents(2, Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(mulCents(10.5, 2)).toBeNull();
    expect(mulCents(100, 0)).toBeNull();
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([Number.MAX_SAFE_INTEGER, 1])).toBeNull();
    expect(sumCents([-1])).toBeNull();
    expect(sumCents([])).toBe(0);
  });

  it("formatBRL sem float", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
    expect(() => formatBRL(1.5)).toThrow(RangeError);
    expect(() => formatBRL(-1)).toThrow(RangeError);
  });

  it("normalizeItemKey: sem acento, minúsculo, espaços colapsados", () => {
    expect(normalizeItemKey("  Lápis   HB ")).toBe("lapis hb");
    expect(normalizeItemKey("CAFÉ")).toBe("cafe");
  });

  it("schemas de fronteira", () => {
    expect(cartItemInputSchema.parse({ name: " Lápis HB ", quantity: 3 })).toEqual({
      itemKey: "lapis hb",
      name: "Lápis HB",
      quantity: 3,
    });
    expect(cartItemInputSchema.safeParse({ name: "", quantity: 1 }).success).toBe(false);
    expect(cartItemInputSchema.safeParse({ name: "x", quantity: 0 }).success).toBe(false);
    expect(cartItemInputSchema.safeParse({ name: "x", quantity: 1.5 }).success).toBe(false);
    expect(createCartSchema.parse({ listId: DEMO_LIST_ID }).strategy).toBe("cheapest");
    expect(createCartSchema.safeParse({ listId: "nao-uuid" }).success).toBe(false);
    expect(
      redirectParamsSchema.safeParse({ cartId: DEMO_LIST_ID, retailer: "../etc" }).success,
    ).toBe(false);
    expect(
      redirectParamsSchema.safeParse({ cartId: DEMO_LIST_ID, retailer: "amazon" }).success,
    ).toBe(true);
  });
});
