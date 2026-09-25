import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";

import { catalogErrorsToCsv, CSV_MAX_BYTES, parseCatalogCsv } from "@/features/stationeries/catalog-csv";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function ok(buf: Uint8Array) {
  const r = parseCatalogCsv(buf);
  if (!r.ok) throw new Error(`esperava ok, veio ${r.fatal}`);
  return r;
}

describe("parseCatalogCsv", () => {
  it("lê nome, preco (vírgula decimal entre aspas) e estoque", () => {
    const r = ok(enc('nome,preco,estoque\nCaderno 96 folhas,"12,50",sim\nLápis HB,3.5,nao\nCola,"7,00",\n'));
    expect(r.errors).toEqual([]);
    expect(r.items.map((i) => [i.name, i.priceCents, i.stock, i.itemKey])).toEqual([
      ["Caderno 96 folhas", 1250, "in_stock", "caderno 96 folhas"],
      ["Lápis HB", 350, "out_of_stock", "lapis hb"],
      ["Cola", 700, "unknown", "cola"],
    ]);
  });
  it("aceita ; como separador (Excel pt-BR) e vírgula decimal sem aspas", () => {
    const r = ok(enc("Nome;Preço;Estoque\nBorracha;2,25;sim\n"));
    expect(r.items[0]).toMatchObject({ name: "Borracha", priceCents: 225, stock: "in_stock" });
  });
  it("estoque é opcional; BOM é ignorado", () => {
    const r = ok(enc("﻿nome,preco\nRégua,\"4,00\"\n"));
    expect(r.items[0]).toMatchObject({ name: "Régua", priceCents: 400, stock: "unknown" });
  });
  it("encoding windows-1252 (Excel no Windows)", () => {
    const buf = iconv.encode("nome;preco\nLápis de cor;5,90\nCaneta ação;3,00\n", "win1252");
    const r = ok(buf);
    expect(r.items.map((i) => i.name)).toEqual(["Lápis de cor", "Caneta ação"]);
  });
  it("colunas faltando é fatal", () => {
    const r = parseCatalogCsv(enc("nome,estoque\nX,sim\n"));
    expect(r).toMatchObject({ ok: false, fatal: "missing_columns", missing: ["preco"] });
    expect(parseCatalogCsv(enc("a,b\n1,2\n"))).toMatchObject({ ok: false, fatal: "missing_columns", missing: ["nome", "preco"] });
  });
  it("vazio, grande demais e malformado são fatais", () => {
    expect(parseCatalogCsv(new Uint8Array())).toMatchObject({ ok: false, fatal: "empty" });
    expect(parseCatalogCsv(enc("  \n "))).toMatchObject({ ok: false, fatal: "empty" });
    expect(parseCatalogCsv(new Uint8Array(CSV_MAX_BYTES + 1))).toMatchObject({ ok: false, fatal: "too_large" });
    expect(parseCatalogCsv(enc('nome,preco\n"aberta,1\n'))).toMatchObject({ ok: false, fatal: "malformed" });
  });
  it("limite de 2.000 linhas: 2.000 passa, 2.001 é fatal", () => {
    const build = (n: number) => enc(`nome,preco\n${Array.from({ length: n }, (_, i) => `Item ${i},${i + 1}.00`).join("\n")}\n`);
    expect(ok(build(2000)).items).toHaveLength(2000);
    expect(parseCatalogCsv(build(2001))).toMatchObject({ ok: false, fatal: "too_many_rows" });
  });
  it("erros por linha não derrubam as demais", () => {
    const r = ok(
      enc(
        [
          "nome,preco,estoque",
          "Bom,5.00,sim",
          '=HYPERLINK("x"),5.00,',
          "+cmd|calc,5.00,",
          "-1 item,5.00,",
          "@soma,5.00,",
          "Sem preço,,",
          "Preço ruim,12abc,",
          "Preço zero,0,",
          "Preço negativo,-3,",
          "Estoque ruim,3.00,talvez",
          ",3.00,",
          `${"x".repeat(201)},3.00,`,
          "Outro bom,\"1,99\",",
        ].join("\n"),
      ),
    );
    expect(r.items.map((i) => i.name)).toEqual(["Bom", "Outro bom"]);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([
      [3, "nome"],
      [4, "nome"],
      [5, "nome"],
      [6, "nome"],
      [7, "preco"],
      [8, "preco"],
      [9, "preco"],
      [10, "preco"],
      [11, "estoque"],
      [12, "nome"],
      [13, "nome"],
    ]);
    expect(r.totalRows).toBe(13);
  });
  it("duplicados no arquivo (por nome normalizado): vale a primeira linha", () => {
    const r = ok(enc("nome,preco\nLápis HB,2.00\n  lapis   hb ,3.00\nCola,1.00\n"));
    expect(r.items.map((i) => [i.name, i.priceCents])).toEqual([
      ["Lápis HB", 200],
      ["Cola", 100],
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 3, field: "nome" });
    expect(r.errors[0]?.message).toContain("linha 2");
  });
  it("idempotência: o mesmo arquivo gera as mesmas chaves", () => {
    const buf = enc("nome,preco\nLápis HB,2.00\nCola,1.00\n");
    const a = ok(buf).items.map((i) => i.itemKey);
    const b = ok(buf).items.map((i) => i.itemKey);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("catalogErrorsToCsv", () => {
  it("neutraliza fórmulas no relatório e escapa aspas", () => {
    const csv = catalogErrorsToCsv([{ line: 2, field: "nome", message: 'diz "oi"', value: "=1+1" }]);
    expect(csv).toContain("linha,campo,erro,valor");
    expect(csv).toContain(`"'=1+1"`);
    expect(csv).toContain('"diz ""oi"""');
  });
});
