import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LEGAL } from "@/features/site/legal";

import { loadPage, renderInSite } from "./helpers";

describe("textos jurídicos preliminares", () => {
  it("LEGAL é todo null nesta fatia", () => {
    expect(Object.values(LEGAL).every((v) => v === null)).toBe(true);
  });

  it.each([
    ["/termos", ["data da última atualização", "e-mail do encarregado de dados"]],
    ["/privacidade", ["razão social", "CNPJ", "prazo de retenção", "prazo de guarda dos documentos de reivindicação", "prazo de guarda da trilha de auditoria", "base legal", "operadores e contratos", "data da última atualização", "e-mail do encarregado de dados"]],
  ] as const)("%s: faixa preliminar e cada placeholder em <mark>", async (route, labels) => {
    const Page = await loadPage(route);
    const { container } = await renderInSite(Page);
    expect(screen.getByText(/Versão preliminar\. Texto em revisão jurídica\./)).toBeInTheDocument();
    const marks = [...container.querySelectorAll("mark")].map((m) => m.textContent);
    for (const l of labels) expect(marks).toContain(`[a definir: ${l}]`);
  });

  it("privacidade: apelido e série; sem nome do aluno, sobrenome nem exclusão em Minha conta", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/apelido e série/i);
    expect(t).not.toMatch(/nome do aluno|sobrenome|Minha conta/i);
    expect(t).toMatch(/e-mail ou conta Google/i);
  });

  it("privacidade: categorias reais e operadores, sem dado que não coletamos", async () => {
    const Page = await loadPage("/privacidade");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    for (const w of [/Supabase/, /Vercel/, /OpenRouter/, /arquivo da lista/i, /cliques em links de loja/i, /Pedidos de cotação/i, /consentimento/i, /carrinhos/i, /Reivindicação de escola/, /cargo, e-mail de contato e nota/, /o arquivo e o hash/, /versão do texto e data/, /Papelarias credenciadas: CNPJ, razão social, endereço, telefone, WhatsApp e e-mail/, /número do responsável fica visível para a papelaria/, /hash do endereço de IP/]) expect(t).toMatch(w);
    expect(t).not.toMatch(/\bcidade\b/i);
  });

  it("última atualização no topo e cartão Dúvidas no fim", async () => {
    const Page = await loadPage("/termos");
    const { container } = await renderInSite(Page);
    const main = container.querySelector("main")!;
    const upd = [...main.querySelectorAll("p")].find((p) => p.textContent?.startsWith("Última atualização"));
    expect(upd).toBeTruthy();
    expect(main.querySelector("h1")!.compareDocumentPosition(upd!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.lastElementChild?.tagName).toBe("ASIDE");
    expect(main.lastElementChild?.textContent).toMatch(/^Dúvidas:/);
  });

  it("termos: compra na loja escolhida e comissão sem mudar o preço", async () => {
    const Page = await loadPage("/termos");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/A compra acontece na loja escolhida, com as regras dela/);
    expect(t).toMatch(/podemos receber comissão das lojas; o preço não muda/i);
  });
});
