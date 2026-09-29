import { describe, it, expect } from "vitest";
import { findDeadEnds } from "@/lib/ux-checks";

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("findDeadEnds", () => {
  it("tela só com texto no main é beco sem saída", () => {
    expect(findDeadEnds(doc(`<header><a href="/">ListaCerta</a></header><main><p>Nenhuma papelaria.</p></main>`), "/cotacao/nova")).toContain("sem ação adiante");
  });
  it("vazio com ação passa", () => {
    expect(findDeadEnds(doc(`<header><a href="/">ListaCerta</a></header><main><p>Nada.</p><a href="/carrinho/1">Voltar ao carrinho</a></main>`), "/cotacao/nova")).toEqual([]);
  });
  it("link só no header não conta como ação adiante", () => {
    expect(findDeadEnds(doc(`<header><a href="/">L</a><a href="/escolas">Escolas</a></header><main><p>x</p></main>`), "/x")).toEqual(["sem ação adiante"]);
  });
  it("âncora interna e botão desabilitado não contam", () => {
    const d = doc(`<header><a href="/">L</a></header><main><a href="#topo">Topo</a><button disabled>Enviar</button></main>`);
    expect(findDeadEnds(d, "/x")).toContain("sem ação adiante");
  });
  it("sem logo linkado, breadcrumb nem Voltar acusa falta de volta", () => {
    expect(findDeadEnds(doc(`<main><a href="/escolas">Ver escolas</a></main>`), "/x")).toEqual(["sem caminho de volta"]);
  });
  it("breadcrumb e botão contam", () => {
    const d = doc(`<nav aria-label="Breadcrumb"><a href="/">Início</a></nav><main><button>Salvar</button></main>`);
    expect(findDeadEnds(d, "/x")).toEqual([]);
  });
});
