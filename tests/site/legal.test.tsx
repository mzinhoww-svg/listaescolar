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
    ["/privacidade", ["razão social", "CNPJ", "prazo de retenção", "data da última atualização", "e-mail do encarregado de dados"]],
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

  it("termos: compra na loja escolhida e comissão sem mudar o preço", async () => {
    const Page = await loadPage("/termos");
    const { container } = await renderInSite(Page);
    const t = container.textContent ?? "";
    expect(t).toMatch(/A compra acontece na loja escolhida, com as regras dela/);
    expect(t).toMatch(/podemos receber comissão das lojas; o preço não muda/i);
  });
});
