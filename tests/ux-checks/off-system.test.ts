import { describe, it, expect } from "vitest";
import { findOffSystemButtons, findOffTokenMotion } from "@/lib/ux-checks";
import { buttonClass } from "@/components/ui/Button";

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("botões fora do sistema", () => {
  it("acusa botão com classes próprias", () => {
    expect(findOffSystemButtons(doc(`<button class="bg-red-600 px-2">Excluir</button>`))).toHaveLength(1);
  });
  it("acusa a[role=button] avulso", () => {
    expect(findOffSystemButtons(doc(`<a role="button" href="/x" class="px-2">Ir</a>`))).toHaveLength(1);
  });
  it("aceita botão do sistema e native-ok", () => {
    const d = doc(`<button class="${buttonClass("outline")}">A</button><button data-ui="native-ok" class="x">B</button><a href="/" class="x">link</a>`);
    expect(findOffSystemButtons(d)).toEqual([]);
  });
});

describe("movimento fora dos tokens", () => {
  it("acusa transição de 500ms e aceita 200ms", () => {
    expect(findOffTokenMotion(".a{transition:opacity 500ms}")).toHaveLength(1);
    expect(findOffTokenMotion(".a{transition:opacity 200ms}")).toHaveLength(0);
  });
  it("aceita 120, 320 e var(--mov-*)", () => {
    const css = ".a{transition:opacity 120ms}.b{transition-duration:320ms}.c{transition:opacity var(--mov-base) ease}.d{animation:x var(--mov-entrada)}.e{transition-duration:var(--mov-rapido)}";
    expect(findOffTokenMotion(css)).toEqual([]);
  });
  it("interpreta segundos", () => {
    expect(findOffTokenMotion(".a{transition:all .15s}")).toHaveLength(1);
    expect(findOffTokenMotion(".a{transition:all 0.2s}")).toHaveLength(0);
    expect(findOffTokenMotion(".a{animation:x 1.4s ease}")).toHaveLength(1);
  });
  it("atraso no atalho não conta como duração", () => {
    expect(findOffTokenMotion(".a{transition:opacity 200ms ease 1s}")).toEqual([]);
  });
  it("vários itens: acusa só o fora do token", () => {
    expect(findOffTokenMotion(".a{transition:opacity 200ms,transform 700ms}")).toHaveLength(1);
  });
  it("delega ao utilitário duration-* e checa --tw-duration", () => {
    expect(findOffTokenMotion(".t{transition-duration:var(--tw-duration,var(--default-transition-duration))}")).toEqual([]);
    expect(findOffTokenMotion(".duration-500{--tw-duration:500ms;transition-duration:500ms}")).toHaveLength(2);
  });
  it("isenta indicadores de carregamento (lista nomeada)", () => {
    expect(findOffTokenMotion(".animate-spin{animation:spin 1s linear infinite}")).toEqual([]);
    expect(findOffTokenMotion(".animate-pulse{animation:pulse 2s infinite}")).toEqual([]);
    expect(findOffTokenMotion(".x{animation:pesquisa-pulso 1.4s ease-in-out infinite}")).toEqual([]);
    expect(findOffTokenMotion("@theme{--animate-spin:spin 1s linear infinite}")).toEqual([]);
    expect(findOffTokenMotion(".x{animation:bounce 1s infinite}")).toHaveLength(1);
  });
  it("ignora comentários e keyframes sem duração", () => {
    expect(findOffTokenMotion("/* transition: all 900ms */@keyframes a{from{opacity:0}to{opacity:1}}")).toEqual([]);
  });
});
