import { describe, it, expect } from "vitest";
import { findDeadEnds, normalizeHref } from "@/lib/ux-checks";

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");
const H = `<header><a href="/">ListaCerta</a></header>`;

describe("findDeadEnds: adiante", () => {
  it("tela só com texto no main é beco sem saída", () => {
    expect(findDeadEnds(doc(`${H}<main><p>Nenhuma papelaria.</p></main>`), "/cotacao/nova")).toContain("sem ação adiante");
  });
  it("vazio com ação adiante e Voltar passa", () => {
    expect(findDeadEnds(doc(`${H}<main><p>Nada.</p><a href="/carrinho/novo">Montar carrinho</a><a href="/cotacao">Voltar</a></main>`), "/cotacao/nova")).toEqual([]);
  });
  it("só Voltar não é adiante", () => {
    expect(findDeadEnds(doc(`${H}<main><a href="/cotacao">Voltar ao carrinho</a></main>`), "/cotacao/nova")).toEqual(["sem ação adiante"]);
  });
  it("Cancelar e Fechar (texto ou aria-label) não são adiante", () => {
    const d = doc(`${H}<main><a href="/cotacao">Cancelar</a><button aria-label="Fechar aviso">x</button></main>`);
    expect(findDeadEnds(d, "/cotacao/nova")).toContain("sem ação adiante");
  });
  it("botão de ícone e de menu não são adiante", () => {
    const d = doc(`${H}<main><button class="rounded-botao h-11 w-11 p-0" aria-label="Mais">i</button><button aria-expanded="false" aria-controls="m">Menu</button><button aria-label="Compartilhar"></button></main>`);
    expect(findDeadEnds(d, "/x/y")).toContain("sem ação adiante");
  });
  it("barra de abas em nav fora de header/footer não é adiante", () => {
    const d = doc(`${H}<nav aria-label="Abas"><a href="/conta">Conta</a><a href="/conta/compras">Compras</a></nav><main><p>x</p></main>`);
    expect(findDeadEnds(d, "/x/y")).toContain("sem ação adiante");
  });
  it("link só no header, âncora interna e desabilitado não contam", () => {
    const d = doc(`<header><a href="/">L</a><a href="/escolas">Escolas</a></header><main><a href="#topo">Topo</a><button disabled>Enviar</button></main>`);
    expect(findDeadEnds(d, "/x")).toContain("sem ação adiante");
  });
  it("botão de texto conta como adiante", () => {
    expect(findDeadEnds(doc(`${H}<main><button>Salvar aluno</button><a href="/conta">Voltar</a></main>`), "/conta/alunos/novo")).toEqual([]);
  });
});

describe("findDeadEnds: volta", () => {
  it("rota de entrada aceita o logo do header", () => {
    expect(findDeadEnds(doc(`${H}<main><a href="/escolas/1">Abrir</a></main>`), "/escolas")).toEqual([]);
  });
  it("rota de entrada sem logo linkado acusa", () => {
    expect(findDeadEnds(doc(`<main><a href="/escolas/1">Abrir</a></main>`), "/conta")).toEqual(["sem caminho de volta"]);
  });
  it("fora da entrada o logo não basta", () => {
    expect(findDeadEnds(doc(`${H}<main><a href="/carrinho/1">Abrir</a></main>`), "/cotacao/nova")).toEqual(["sem caminho de volta"]);
  });
  it("Voltar/Cancelar dentro do main conta; fora do main não", () => {
    expect(findDeadEnds(doc(`${H}<main><a href="/x">Abrir</a><a href="/y">Cancelar</a></main>`), "/a/b")).toEqual([]);
    expect(findDeadEnds(doc(`${H}<a href="/y">Voltar</a><main><a href="/x">Abrir</a></main>`), "/a/b")).toEqual(["sem caminho de volta"]);
  });
  it("migalha com aria-label conta (migalha, breadcrumb, trilha)", () => {
    for (const label of ["Migalha de pão", "Breadcrumb", "Trilha"]) {
      expect(findDeadEnds(doc(`${H}<main><nav aria-label="${label}"><a href="/escolas">Escolas</a></nav><a href="/x">Abrir</a></main>`), "/escolas/1/ef-5")).toEqual([]);
    }
    expect(findDeadEnds(doc(`${H}<main><nav aria-label="Abas"></nav><a href="/x">Abrir</a></main>`), "/a/b")).toEqual(["sem caminho de volta"]);
  });
  it("link para a rota-pai conta (com href absoluto e query)", () => {
    const d = doc(`${H}<main><a href="/x">Abrir</a><a href="http://127.0.0.1:3003/escolas/9?x=1">Escola</a></main>`);
    expect(findDeadEnds(d, "/escolas/9/ef-5", "http://127.0.0.1:3003")).toEqual([]);
    expect(findDeadEnds(doc(`${H}<main><a href="/x">Abrir</a><a href="/escolas">Escolas</a></main>`), "/escolas/9/ef-5")).toEqual(["sem caminho de volta"]);
  });
  it("rota de um segmento tem a raiz como pai", () => {
    expect(findDeadEnds(doc(`${H}<main><a href="/x">Abrir</a><a href="/">Início</a></main>`), "/403")).toEqual([]);
  });
  it("path com query é normalizado", () => {
    expect(findDeadEnds(doc(`${H}<main><a href="/x">Abrir</a></main>`), "/escolas?q=a")).toEqual([]);
  });
});

describe("normalizeHref", () => {
  it("normaliza relativo, query, barra final e origin", () => {
    expect(normalizeHref("/?x=1")).toBe("/");
    expect(normalizeHref("/escolas/")).toBe("/escolas");
    expect(normalizeHref("http://127.0.0.1:3003/conta#a", "http://127.0.0.1:3003")).toBe("/conta");
    expect(normalizeHref("https://outro.com/conta", "http://127.0.0.1:3003")).toBeNull();
    expect(normalizeHref("#x")).toBeNull();
    expect(normalizeHref("mailto:a@b.c")).toBeNull();
  });
});
